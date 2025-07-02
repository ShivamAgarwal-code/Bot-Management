// src/modules/bot-management/services/bot-engine.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetHistory } from '../entities/bet-history.entity';
import { BotConfig } from '../entities/bot-config.entity';
import { BotWallet } from '../entities/wallet.entity';
import { WalletService } from './wallet.service';
import { BotConfigService } from './bot-config.service';
import { Web3Service, RoundInfo } from './web3.service';
import { BLOCKCHAIN_CONFIG } from '../config/blockchain.config';
import { Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);
  private isRunning = false;
  private currentRoundId = 0;
  private roundCheckInterval: NodeJS.Timeout;
  private betExecutionInterval: NodeJS.Timeout;
  private roundStartTime: number = 0;

  constructor(
    private walletService: WalletService,
    private configService: BotConfigService,
    private web3Service: Web3Service,
    private config: ConfigService,
    @InjectRepository(BetHistory)
    private betHistoryRepository: Repository<BetHistory>,
    @InjectRepository(BotWallet)
    private walletRepository: Repository<BotWallet>,
  ) {}

  async startBot(): Promise<void> {
    if (this.isRunning) {
      throw new BadRequestException('Bot is already running');
    }

    const botConfig = await this.configService.getConfig();
    if (botConfig.status !== 'running') {
      await this.configService.updateStatus('running');
    }

    // Check if we have active wallets
    const wallets = await this.walletService.getWallets();
    if (!wallets || wallets.length === 0) {
      throw new BadRequestException('No active wallets found. Please generate wallets first.');
    }

    this.isRunning = true;
    this.logger.log('🚀 Bot engine started successfully');
    this.logger.log(`📊 Active wallets: ${wallets.length}`);

    // Start monitoring rounds
    await this.startRoundMonitoring();
  }

  async stopBot(): Promise<void> {
    this.isRunning = false;
    
    if (this.roundCheckInterval) {
      clearInterval(this.roundCheckInterval);
    }
    
    if (this.betExecutionInterval) {
      clearInterval(this.betExecutionInterval);
    }
    
    await this.configService.updateStatus('stopped');
    this.logger.log('🛑 Bot engine stopped');
  }

  private async startRoundMonitoring(): Promise<void> {
    this.logger.log('🔍 Starting round monitoring...');
    
    // Check for new rounds every 5 seconds
    this.roundCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const currentRound = await this.web3Service.getCurrentRound();
        
        if (currentRound && currentRound.roundId !== this.currentRoundId) {
          this.logger.log(`🎯 New round detected: ${currentRound.roundId}`);
          this.logger.log(`📈 Round status: ${currentRound.status}`);
          this.logger.log(`💰 Pools - UP: ${currentRound.upPool} SOL, DOWN: ${currentRound.downPool} SOL`);
          
          this.currentRoundId = currentRound.roundId;
          this.roundStartTime = currentRound.startTime;
          
          // Schedule betting for this round
          await this.scheduleRoundBetting(currentRound);
        }
      } catch (error) {
        this.logger.error('❌ Error in round monitoring:', error.message);
      }
    }, 5000); // Check every 5 seconds
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
        if (roundInfo.roundId < botConfig.epochFrom || roundInfo.roundId > botConfig.epochTo) {
          this.logger.log(`⏭️ Round ${roundInfo.roundId} is outside epoch range [${botConfig.epochFrom}-${botConfig.epochTo}], skipping`);
          return;
        }
      }

      // Calculate when to start betting (random time within configured range)
      const betStartDelay = this.getRandomInRange(botConfig.betTimeFrom, botConfig.betTimeTo) * 1000;
      
      this.logger.log(`⏰ Scheduling bets for round ${roundInfo.roundId} in ${betStartDelay/1000} seconds`);
      
      setTimeout(async () => {
        if (this.isRunning && this.currentRoundId === roundInfo.roundId) {
          await this.executeRoundStrategy(roundInfo);
        }
      }, betStartDelay);

    } catch (error) {
      this.logger.error('❌ Error scheduling round betting:', error);
    }
  }

  private async executeRoundStrategy(roundInfo: RoundInfo): Promise<void> {
    try {
      this.logger.log(`🎲 Executing betting strategy for round ${roundInfo.roundId}`);
      
      const botConfig = await this.configService.getConfig();
      
      // Check if round is still open
      const currentRound = await this.web3Service.getCurrentRound();
      if (!currentRound || currentRound.roundId !== roundInfo.roundId || currentRound.status !== 'open') {
        this.logger.log(`🔒 Round ${roundInfo.roundId} is no longer open, skipping bets`);
        return;
      }

      // Get active wallets with sufficient balance
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
      
      this.logger.log(`👥 Selected ${selectedWallets.length} wallets for round ${roundInfo.roundId}`);

      // Calculate betting strategy based on current pool ratios
      const strategy = this.calculateBettingStrategy(currentRound, botConfig);
      this.logger.log(`📊 Betting strategy:`, strategy.message);

      // Execute bets for selected wallets with staggered timing
      await this.executeBetsWithDelay(selectedWallets, currentRound, strategy, botConfig);

    } catch (error) {
      this.logger.error(`❌ Error in executeRoundStrategy:`, error);
    }
  }

  private async getActiveWalletsWithBalance(botConfig: BotConfig): Promise<BotWallet[]> {
    const minBetAmount = Math.min(botConfig.minBetFrom, botConfig.minBetTo);
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
      const wallet = wallets[i];
      
      // Add random delay between bets (1-5 seconds)
      if (i > 0) {
        const delay = Math.random() * 4000 + 1000; // 1-5 seconds
        await this.sleep(delay);
      }

      // Check if bot is still running and round is still valid
      if (!this.isRunning) break;
      
      const currentRound = await this.web3Service.getCurrentRound();
      if (!currentRound || currentRound.roundId !== roundInfo.roundId || currentRound.status !== 'open') {
        this.logger.log(`🔒 Round ${roundInfo.roundId} closed during betting, stopping remaining bets`);
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
      
      // Calculate bet amount
      const minBet = this.getRandomInRange(botConfig.minBetFrom, botConfig.minBetTo);
      const maxBet = this.getRandomInRange(botConfig.maxBetFrom, botConfig.maxBetTo);
      const betAmount = Number(this.getRandomInRange(minBet, maxBet).toFixed(6));

      // Validate bet amount against wallet balance
      if (wallet.balance < betAmount + 0.002) {
        this.logger.warn(`💸 Wallet ${wallet.address} insufficient balance: ${wallet.balance} SOL (need ${betAmount + 0.002} SOL)`);
        return;
      }

      this.logger.log(`💰 Placing ${direction ? 'UP' : 'DOWN'} bet of ${betAmount} SOL for wallet ${wallet.address.slice(0, 8)}...`);

      // Get wallet keypair
      const walletKeypair = this.getWalletKeypair(wallet);

      // Record bet attempt in history
      const betHistory = new BetHistory();
      betHistory.walletAddress = wallet.address;
      betHistory.epoch = roundInfo.roundId;
      betHistory.direction = direction ? 'up' : 'down';
      betHistory.amount = betAmount;
      betHistory.betTime = Math.floor((Date.now() - roundInfo.startTime) / 1000);
      betHistory.status = 'pending';

      const savedBetHistory = await this.betHistoryRepository.save(betHistory);

      // Place bet on blockchain
      const betResult = await this.web3Service.placeBet(
        walletKeypair,
        roundInfo.roundId,
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

  private getWalletKeypair(wallet: BotWallet): Keypair {
    try {
      const decryptedPrivateKey = this.decryptPrivateKey(wallet.privateKey);
      const privateKeyArray = JSON.parse(decryptedPrivateKey);
      return Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    } catch (error) {
      throw new Error(`Failed to get keypair for wallet ${wallet.address}: ${error.message}`);
    }
  }

  private decryptPrivateKey(encryptedKey: string): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY not found in environment variables');
    }
    // The IV should be stored alongside the encrypted data, or you must know how it was generated.
    // Here, we assume the IV is prefixed to the encryptedKey as hex (32 chars for 16 bytes IV).
    const ivLength = 16; // For AES, this is always 16
    const ivHexLength = ivLength * 2;
    const ivHex = encryptedKey.slice(0, ivHexLength);
    const encryptedHex = encryptedKey.slice(ivHexLength);
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), iv);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private selectRandomWallets(wallets: BotWallet[], count: number): BotWallet[] {
    const shuffled = [...wallets].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, wallets.length));
  }

  private getRandomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private calculateBettingStrategy(roundInfo: RoundInfo, botConfig: BotConfig): any {
    const totalPool = roundInfo.upPool + roundInfo.downPool;
    const currentUpRatio = totalPool > 0 ? roundInfo.upPool / totalPool : 0.5;
    const currentDownRatio = 1 - currentUpRatio;
    
    // Calculate target ratios from config (normalized to 0-1 range)
    const targetUpRange = (botConfig.upBalanceFrom + botConfig.upBalanceTo) / 2;
    const targetDownRange = (botConfig.downBalanceFrom + botConfig.downBalanceTo) / 2;
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
      upPool: roundInfo.upPool,
      downPool: roundInfo.downPool,
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

    return {
      isRunning: this.isRunning,
      status: config.status,
      currentRoundId: this.currentRoundId,
      activeWallets: wallets.length,
      totalWalletBalance: wallets.reduce((sum, w) => sum + Number(w.balance), 0),
      recentBets: recentBets.length,
      config: {
        walletCountRange: `${config.walletCountFrom}-${config.walletCountTo}`,
        betAmountRange: `${config.minBetFrom}-${config.maxBetFrom} SOL`,
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
    };

    return {
      roundId: roundId || 'All rounds',
      ...stats,
      averageBetAmount: stats.totalBets > 0 ? (stats.totalAmount / stats.totalBets).toFixed(6) : 0,
      upBetPercentage: stats.totalBets > 0 ? ((stats.upBets / stats.totalBets) * 100).toFixed(1) : 0,
      downBetPercentage: stats.totalBets > 0 ? ((stats.downBets / stats.totalBets) * 100).toFixed(1) : 0,
    };
  }
}