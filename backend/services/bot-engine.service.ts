// src/modules/bot-management/services/bot-engine.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetHistory } from '../entities/bet-history.entity';
import { BotConfig } from '../entities/bot-config.entity';
import { BotWallet } from '../entities/wallet.entity';
import { WalletService } from './wallet.service';
import { BotConfigService } from './bot-config.service';
import { Web3Service, RoundInfo, ClaimableRound } from './web3.service';
import { BLOCKCHAIN_CONFIG } from '../config/blockchain.config';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AdminDashboardService } from 'src/admin-dashboard/admin-dashboard.service';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);
  private currentRoundId = 0;
  private roundCheckInterval: NodeJS.Timeout;
  private betExecutionInterval: NodeJS.Timeout;
  private claimCheckInterval: NodeJS.Timeout;
  private roundStartTime: number = 0;

  constructor(
    private walletService: WalletService,
    private configService: BotConfigService,
    private web3Service: Web3Service,
    private config: ConfigService,
    private adminDashboardService: AdminDashboardService,
    @InjectRepository(BetHistory)
    private betHistoryRepository: Repository<BetHistory>,
    @InjectRepository(BotWallet)
    private walletRepository: Repository<BotWallet>,
  ) { }

  async startBot(): Promise<void> {
    const botConfig = await this.configService.getConfig();
    if (botConfig.status !== 'running') {
      await this.configService.updateStatus('running');
    }

    // Check if we have active wallets
    const wallets = await this.walletService.getWallets();
    if (!wallets || wallets.length === 0) {
      throw new BadRequestException('No active wallets found. Please generate wallets first.');
    }

    this.logger.log('🚀 Bot engine started successfully');
    this.logger.log(`📊 Active wallets: ${wallets.length}`);

    // Start monitoring rounds and auto-claiming
    await this.startRoundMonitoring();
    await this.startAutoClaimMonitoring();
  }

  async stopBot(): Promise<void> {
    if (this.roundCheckInterval) {
      clearInterval(this.roundCheckInterval);
    }

    if (this.betExecutionInterval) {
      clearInterval(this.betExecutionInterval);
    }

    if (this.claimCheckInterval) {
      clearInterval(this.claimCheckInterval);
    }

    await this.configService.updateStatus('stopped');
    this.logger.log('🛑 Bot engine stopped');
  }

  @Interval(5000)
  private async startRoundMonitoring(): Promise<void> {
    const botConfig = await this.configService.getConfig();
    if (botConfig.status !== 'running') {
      return;
    }

    try {
      const currentRound = await this.adminDashboardService.getNextRoundInfo();
      if (currentRound && currentRound.number !== this.currentRoundId) {
        this.logger.log(`🎯 New round detected: ${currentRound.number}`);
        this.logger.log(`📈 Round status: ${currentRound.status}`);
        this.logger.log(`💰 Pools - UP: ${currentRound.totalBullAmount} SOL, DOWN: ${currentRound.totalBearAmount} SOL`);

        this.currentRoundId = currentRound.number;
        this.roundStartTime = currentRound.startTime;

        // Schedule betting for this round
        await this.scheduleRoundBetting(currentRound);
      }
    } catch (error) {
      this.logger.error('❌ Error in round monitoring:', error.message);
    }
  }
  private async startAutoClaimMonitoring(): Promise<void> {
    // Clear any existing interval first
    if (this.claimCheckInterval) {
      clearInterval(this.claimCheckInterval);
    }

    // Start the interval for auto-claim monitoring
    this.claimCheckInterval = setInterval(async () => {
      const botConfig = await this.configService.getConfig();
      if (botConfig.status !== 'running') {
        return;
      }

      try {
        await this.processAutoClaimsForAllWallets();
      } catch (error) {
        this.logger.error('❌ Error in auto-claim monitoring:', error.message);
      }
    }, 10000); // Check every 10 seconds

    this.logger.log('🔄 Auto-claim monitoring started');
  }

  private async processAutoClaimsForAllWallets(): Promise<void> {
    try {
      const wallets = await this.walletService.getWallets();

      if (wallets.length === 0) {
        return;
      }

      this.logger.debug(`🔍 Checking ${wallets.length} wallets for claimable rewards...`);

      // Process wallets sequentially instead of in batches to avoid RPC issues
      for (const wallet of wallets) {
        try {
          await this.processAutoClaimForWallet(wallet);
          // Small delay between wallets to avoid overwhelming RPC
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          this.logger.error(`❌ Auto-claim failed for wallet ${wallet.address}:`, error.message);
        }
      }
    } catch (error) {
      this.logger.error('❌ Error processing auto-claims for all wallets:', error);
    }
  }

  private async processAutoClaimForWallet(wallet: BotWallet): Promise<void> {
    try {
      const walletKeypair = await this.walletService.getWalletKeypair(wallet);
      const claimableRounds = await this.web3Service.getClaimableRounds(walletKeypair);

      if (claimableRounds.length === 0) {
        return; // No claimable rounds for this wallet
      }

      this.logger.log(`💰 Found ${claimableRounds.length} claimable rounds for wallet ${wallet.address.slice(0, 8)}...`);

      // Claim all available rewards for this wallet
      const claimResults = await this.web3Service.claimAllAvailableRewards(walletKeypair);

      if (claimResults.successfulClaims > 0) {
        this.logger.log(`✅ Auto-claimed ${claimResults.totalClaimed.toFixed(6)} SOL from ${claimResults.successfulClaims} rounds for wallet ${wallet.address.slice(0, 8)}...`);

        // Update wallet balance in database
        const newBalance = await this.web3Service.getWalletBalance(wallet.address);
        wallet.balance = newBalance;
        await this.walletRepository.save(wallet);

        // Update bet history records to reflect claims
        await this.updateBetHistoryAfterClaims(wallet.address, claimableRounds, claimResults.results);
      }

      if (claimResults.failedClaims > 0) {
        this.logger.warn(`⚠️ Failed to claim from ${claimResults.failedClaims} rounds for wallet ${wallet.address.slice(0, 8)}...`);
      }

    } catch (error) {
      this.logger.error(`❌ Error in auto-claim for wallet ${wallet.address}:`, error);
    }
  }

  private async updateBetHistoryAfterClaims(
    walletAddress: string,
    claimableRounds: ClaimableRound[],
    claimResults: any[]
  ): Promise<void> {
    try {
      for (let i = 0; i < claimableRounds.length && i < claimResults.length; i++) {
        const claimableRound = claimableRounds[i];
        const claimResult = claimResults[i];

        if (claimResult.success && claimResult.amount) {
          // Find and update the corresponding bet history record
          const betHistory = await this.betHistoryRepository.findOne({
            where: {
              walletAddress: walletAddress,
              epoch: claimableRound.roundId,
              direction: claimableRound.direction
            }
          });

          if (betHistory) {
            betHistory.status = 'won';
            betHistory.payout = claimResult.amount;
            await this.betHistoryRepository.save(betHistory);

            this.logger.debug(`📝 Updated bet history for round ${claimableRound.roundId}: claimed ${claimResult.amount.toFixed(6)} SOL`);
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Error updating bet history after claims:', error);
    }
  }

  // Manual claim method for individual wallets
  async manualClaimForWallet(walletId: number): Promise<{
    success: boolean;
    message: string;
    totalClaimed?: number;
    claimedRounds?: number;
  }> {
    try {
      const wallet = await this.walletRepository.findOne({
        where: { id: walletId, isActive: true }
      });

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      const walletKeypair = await this.walletService.getWalletKeypair(wallet);
      const claimableRounds = await this.web3Service.getClaimableRounds(walletKeypair);

      if (claimableRounds.length === 0) {
        return { success: true, message: 'No claimable rewards found', totalClaimed: 0, claimedRounds: 0 };
      }

      this.logger.log(`🎯 Manual claim initiated for wallet ${wallet.address.slice(0, 8)}... (${claimableRounds.length} rounds)`);

      const claimResults = await this.web3Service.claimAllAvailableRewards(walletKeypair);

      if (claimResults.successfulClaims > 0) {
        // Update wallet balance
        const newBalance = await this.web3Service.getWalletBalance(wallet.address);
        wallet.balance = newBalance;
        await this.walletRepository.save(wallet);

        // Update bet history
        await this.updateBetHistoryAfterClaims(wallet.address, claimableRounds, claimResults.results);

        return {
          success: true,
          message: `Successfully claimed ${claimResults.totalClaimed.toFixed(6)} SOL from ${claimResults.successfulClaims} rounds`,
          totalClaimed: claimResults.totalClaimed,
          claimedRounds: claimResults.successfulClaims
        };
      } else {
        return {
          success: false,
          message: `Failed to claim rewards: ${claimResults.results[0]?.error || 'Unknown error'}`
        };
      }

    } catch (error) {
      this.logger.error('❌ Error in manual claim:', error);
      return {
        success: false,
        message: `Failed to process claim: ${error.message}`
      };
    }
  }

  // Get claimable rewards summary for all wallets
  async getClaimableRewardsSummary(): Promise<{
    totalWalletsWithRewards: number;
    totalClaimableAmount: number;
    totalClaimableRounds: number;
    walletSummaries: Array<{
      walletId: number;
      walletAddress: string;
      claimableRounds: number;
      estimatedRewards: number;
    }>;
  }> {
    try {
      const wallets = await this.walletService.getWallets();
      const walletSummaries: Array<{
        walletId: number;
        walletAddress: string;
        claimableRounds: number;
        estimatedRewards: number;
      }> = [];
      let totalClaimableAmount = 0;
      let totalClaimableRounds = 0;
      let totalWalletsWithRewards = 0;

      for (const wallet of wallets) {
        try {
          // Skip wallets without private keys
          if (!wallet.privateKey) {
            this.logger.warn(`⚠️ Skipping wallet ${wallet.address} - No private key found`);
            continue;
          }

          const walletKeypair = await this.walletService.getWalletKeypair(wallet);
          const claimableRounds = await this.web3Service.getClaimableRounds(walletKeypair);

          const estimatedRewards = claimableRounds.reduce((sum, round) => sum + round.estimatedReward, 0);

          if (claimableRounds.length > 0) {
            totalWalletsWithRewards++;
            totalClaimableAmount += estimatedRewards;
            totalClaimableRounds += claimableRounds.length;

            walletSummaries.push({
              walletId: wallet.id,
              walletAddress: wallet.address,
              claimableRounds: claimableRounds.length,
              estimatedRewards: estimatedRewards
            });
          }
        } catch (error) {
          this.logger.error(`❌ Error checking claimable rewards for wallet ${wallet.address}:`, error.message);
          // Continue with next wallet instead of failing completely
        }
      }

      return {
        totalWalletsWithRewards,
        totalClaimableAmount,
        totalClaimableRounds,
        walletSummaries
      };

    } catch (error) {
      this.logger.error('❌ Error getting claimable rewards summary:', error);
      // Return empty summary instead of throwing
      return {
        totalWalletsWithRewards: 0,
        totalClaimableAmount: 0,
        totalClaimableRounds: 0,
        walletSummaries: []
      };
    }
  }

  private async scheduleRoundBetting(roundInfo: RoundInfo): Promise<void> {
    try {
      const botConfig = await this.configService.getConfig();

      if (botConfig.status !== 'running') {
        this.logger.log('⏸️ Bot is not in running state, skipping round');
        return;
      }

      // Check if round is within configured epoch range
      if (botConfig.epochFrom && botConfig.epochTo) {
        if (roundInfo.number < botConfig.epochFrom || roundInfo.number > botConfig.epochTo) {
          this.logger.log(`⏭️ Round ${roundInfo.number} is outside epoch range [${botConfig.epochFrom}-${botConfig.epochTo}], skipping`);
          return;
        }
      }

      // Calculate when to start betting (random time within configured range)
      const betStartDelay = this.getRandomInRange(botConfig.betTimeFrom, botConfig.betTimeTo) * 1000;

      this.logger.log(`⏰ Scheduling bets for round ${roundInfo.number} in ${betStartDelay / 1000} seconds`);

      setTimeout(async () => {
        if (botConfig.status === 'running') {
          await this.executeRoundStrategy(roundInfo);
        }
      }, betStartDelay);

    } catch (error) {
      this.logger.error('❌ Error scheduling round betting:', error);
    }
  }

  private async executeRoundStrategy(roundInfo: RoundInfo): Promise<void> {
    try {
      this.logger.log(`🎲 Executing betting strategy for round ${roundInfo.number}`);

      // Get fresh config for each round
      const botConfig = await this.configService.getConfig();

      if (botConfig.status !== 'running') {
        this.logger.log('⏸️ Bot is not in running state, skipping round');
        return;
      }

      // Check if round is still open
      const currentRound = await this.adminDashboardService.getNextRoundInfo();
      if (!currentRound || currentRound.number !== roundInfo.number) {
        this.logger.log(`🔒 Round ${roundInfo.number} is no longer open, skipping bets`);
        return;
      }

      // Get active wallets with sufficient balance using current config
      const allWallets = await this.getActiveWalletsWithBalance(botConfig);
      if (allWallets.length === 0) {
        this.logger.warn('⚠️ No active wallets with sufficient balance found');
        return;
      }

      // Select random wallets based on configured range
      const walletCount = Math.min(
        Math.floor(this.getRandomInRange(botConfig.walletCountFrom, botConfig.walletCountTo)),
        allWallets.length
      );
      const selectedWallets = this.selectRandomWallets(allWallets, walletCount);

      this.logger.log(`👥 Selected ${selectedWallets.length} wallets for round ${roundInfo.number}`);
      this.logger.log(`🎯 Config: Bet ${botConfig.minBet}-${botConfig.maxBet} SOL, Time ${botConfig.betTimeFrom}-${botConfig.betTimeTo}s`);

      // Calculate betting strategy based on current pool ratios
      const strategy = this.calculateBettingStrategy(currentRound, botConfig);
      this.logger.log(`📊 Betting strategy: ${strategy.message}`);

      // Execute bets for selected wallets with staggered timing
      await this.executeBetsWithDelay(selectedWallets, currentRound, strategy, botConfig);

    } catch (error) {
      this.logger.error(`❌ Error in executeRoundStrategy:`, error);
    }
  }

  private async getActiveWalletsWithBalance(botConfig: BotConfig): Promise<BotWallet[]> {
    const minBetAmount = Math.min(botConfig.minBet, botConfig.maxBet);
    const minRequiredBalance = minBetAmount + 0.002; // Add buffer for transaction fees

    return await this.walletRepository.find({
      where: {
        isActive: true,
      },
    }).then(wallets => wallets.filter(wallet => wallet.balance >= minRequiredBalance));
  }

  private async executeBetsWithDelay(
    wallets: BotWallet[],
    roundInfo: RoundInfo,
    strategy: any,
    botConfig: BotConfig
  ): Promise<void> {
    for (let i = 0; i < wallets.length; i++) {
      const botConfig = await this.configService.getConfig();

      if (botConfig.status !== 'running') {
        this.logger.log('⏸️ Bot is not in running state, skipping round');
        return;
      }

      const wallet = wallets[i];

      // Add random delay between bets (1-5 seconds)
      if (i > 0) {
        const delay = Math.random() * 50; // 1-5 seconds
        await this.sleep(delay);
      }

      // Check if bot is still running and round is still valid
      const currentConfig = await this.configService.getConfig();
      if (currentConfig.status !== 'running') break;

      const currentRound = await this.adminDashboardService.getNextRoundInfo();
      if (!currentRound || currentRound.number !== roundInfo.number) {
        this.logger.log(`🔒 Round ${roundInfo.number} closed during betting, stopping remaining bets`);
        break;
      }

      // Execute bet for this wallet
      this.executeBetForWallet(wallet, currentRound, strategy, botConfig)
        .catch(error => {
          this.logger.error(`❌ Bet execution failed for wallet ${wallet.address}:`, error.message);
        });
    }
  }

  private async executeBetForWallet(
    wallet: BotWallet,
    roundInfo: RoundInfo,
    strategy: any,
    botConfig: BotConfig
  ): Promise<void> {
    try {
      // Determine bet direction based on strategy
      const direction = this.decideBetDirection(strategy);

      // Calculate bet amount using the correct config properties
      const betAmount = this.getRandomInRange(botConfig.minBet, botConfig.maxBet);

      // Validate bet amount against wallet balance
      if (wallet.balance < betAmount + 0.002) {
        this.logger.warn(`💸 Wallet ${wallet.address} insufficient balance: ${wallet.balance} SOL (need ${betAmount + 0.002} SOL)`);
        return;
      }

      this.logger.log(`💰 Placing ${direction ? 'UP' : 'DOWN'} bet of ${betAmount} SOL for wallet ${wallet.address.slice(0, 8)}...`);

      // Get wallet keypair
      const walletKeypair = await this.walletService.getWalletKeypair(wallet);

      // Record bet attempt in history
      const betHistory = new BetHistory();
      betHistory.walletAddress = wallet.address;
      betHistory.epoch = roundInfo.number;
      betHistory.direction = direction ? 'up' : 'down';
      betHistory.amount = betAmount;
      betHistory.betTime = Math.floor((Date.now() - roundInfo.startTime) / 1000);
      betHistory.status = 'pending';

      const savedBetHistory = await this.betHistoryRepository.save(betHistory);

      // Place bet on blockchain
      const betResult = await this.web3Service.placeBet(
        walletKeypair,
        roundInfo.number,
        direction,
        betAmount
      );

      if (betResult.success && betResult.signature) {
        this.logger.log(`✅ Bet placed successfully: ${wallet.address.slice(0, 8)}... | ${direction ? 'UP' : 'DOWN'} | ${betAmount} SOL | Tx: ${betResult.signature.slice(0, 8)}...`);

        // Update wallet balance
        wallet.balance = Number((wallet.balance - betAmount).toFixed(9));
        await this.walletRepository.save(wallet);

      } else {
        this.logger.error(`❌ Bet failed: ${wallet.address.slice(0, 8)}... | Error: ${betResult.error}`);

        // Update bet history with failure
        savedBetHistory.status = 'lost';
        await this.betHistoryRepository.save(savedBetHistory);
      }

    } catch (error) {
      this.logger.error(`❌ Critical error executing bet for wallet ${wallet.address}:`, error);
    }
  }

  private selectRandomWallets(wallets: BotWallet[], count: number): BotWallet[] {
    const shuffled = [...wallets].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, wallets.length));
  }

  private getRandomInRange(min: number, max: number): number {
    return Number((Number(Math.random() * (max - min)) + Number(min)).toFixed(9));
  }

  private calculateBettingStrategy(roundInfo: RoundInfo, botConfig: BotConfig): any {
    const totalPool = roundInfo.totalBullAmount + roundInfo.totalBearAmount;
    const currentUpRatio = totalPool > 0 ? roundInfo.totalBullAmount / totalPool : 0.5;
    const currentDownRatio = 1 - currentUpRatio;

    // Calculate target ratios from config (normalized to 0-1 range)
    const targetUpRange = this.getRandomInRange(botConfig.upDownBalanceFrom, botConfig.upDownBalanceTo);
    const targetDownRange = targetUpRange;
    const totalTargetRange = targetUpRange + targetDownRange;

    const targetUpRatio = targetUpRange / totalTargetRange;
    const targetDownRatio = targetDownRange / totalTargetRange;

    // Determine betting preference based on pool imbalance
    const upDeficit = targetUpRatio - currentUpRatio;
    const downDeficit = targetDownRatio - currentDownRatio;

    // Favor the direction that needs more balance
    const favorUp = upDeficit > downDeficit;
    const upProbability = favorUp ? 0.75 : 0.25;

    return {
      favorUp,
      upProbability,
      currentUpRatio: currentUpRatio * 100,
      currentDownRatio: currentDownRatio * 100,
      targetUpRatio: targetUpRatio * 100,
      targetDownRatio: targetDownRatio * 100,
      totalPool,
      upPool: roundInfo.totalBullAmount,
      downPool: roundInfo.totalBearAmount,
      message: `Current: UP ${(currentUpRatio * 100).toFixed(1)}% | DOWN ${(currentDownRatio * 100).toFixed(1)}% | Target: UP ${(targetUpRatio * 100).toFixed(1)}% | DOWN ${(targetDownRatio * 100).toFixed(1)}% | Favoring: ${favorUp ? 'UP' : 'DOWN'}`
    };
  }

  private decideBetDirection(strategy: any): boolean {
    return Math.random() < strategy.upProbability;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods for monitoring
  async getBotStatus(): Promise<any> {
    const config = await this.configService.getConfig();
    const wallets = await this.walletService.getWallets();
    const recentBets = await this.betHistoryRepository.find({
      order: { createdAt: 'DESC' },
      take: 10
    });

    // Get claimable rewards summary
    const claimableSummary = await this.getClaimableRewardsSummary();

    return {
      isRunning: config.status === 'running',
      status: config.status,
      currentRoundId: this.currentRoundId,
      activeWallets: wallets.length,
      totalWalletBalance: wallets.reduce((sum, w) => sum + Number(w.balance), 0),
      recentBets: recentBets.length,
      claimableRewards: {
        totalWalletsWithRewards: claimableSummary.totalWalletsWithRewards,
        totalClaimableAmount: claimableSummary.totalClaimableAmount,
        totalClaimableRounds: claimableSummary.totalClaimableRounds
      },
      config: {
        walletCountRange: `${config.walletCountFrom}-${config.walletCountTo}`,
        betAmountRange: `${config.minBet}-${config.maxBet} SOL`,
        betTimeRange: `${config.betTimeFrom}-${config.betTimeTo}s`,
        epochRange: config.epochFrom && config.epochTo ? `${config.epochFrom}-${config.epochTo}` : 'All rounds'
      }
    };
  }

  async getBettingHistory(limit: number = 50): Promise<BetHistory[]> {
    return await this.betHistoryRepository.find({
      order: { createdAt: 'DESC' },
      take: limit
    });
  }

  async getCurrentRoundInfo(): Promise<RoundInfo> {
    try {
      const roundInfo = await this.adminDashboardService.getNextRoundInfo();
      return roundInfo;
    } catch (error) {
      this.logger.error('Failed to get current round info:', error);
      throw new Error('Unable to fetch current round information');
    }
  }

  async getRoundStats(roundId?: number): Promise<any> {
    const query = this.betHistoryRepository.createQueryBuilder('bet');

    if (roundId) {
      query.where('bet.epoch = :roundId', { roundId });
    }

    const bets = await query.getMany();

    const stats = {
      totalBets: bets.length,
      totalAmount: bets.reduce((sum, bet) => sum + Number(bet.amount), 0),
      upBets: bets.filter(bet => bet.direction === 'up').length,
      downBets: bets.filter(bet => bet.direction === 'down').length,
      pendingBets: bets.filter(bet => bet.status === 'pending').length,
      wonBets: bets.filter(bet => bet.status === 'won').length,
      lostBets: bets.filter(bet => bet.status === 'lost').length,
      totalPayout: bets.reduce((sum, bet) => sum + Number(bet.payout || 0), 0),
    };

    return {
      roundId: roundId || 'All rounds',
      ...stats,
      averageBetAmount: stats.totalBets > 0 ? (stats.totalAmount / stats.totalBets).toFixed(6) : 0,
      upBetPercentage: stats.totalBets > 0 ? ((stats.upBets / stats.totalBets) * 100).toFixed(1) : 0,
      downBetPercentage: stats.totalBets > 0 ? ((stats.downBets / stats.totalBets) * 100).toFixed(1) : 0,
      winRate: stats.totalBets > 0 ? ((stats.wonBets / (stats.wonBets + stats.lostBets)) * 100).toFixed(1) : 0,
      totalProfit: (stats.totalPayout - stats.totalAmount).toFixed(6)
    };
  }
}