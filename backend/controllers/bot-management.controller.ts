import { Controller, Get, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { WalletService } from '../services/wallet.service';
import { BotConfigService } from '../services/bot-config.service';
import { BotEngineService } from '../services/bot-engine.service';
import { Web3Service } from '../services/web3.service';
import { DistributeDto } from '../dto/wallet-config.dto';
import { BotConfigDto } from '../dto/bot-config.dto';

@Controller('bot-management')
export class BotManagementController {
  constructor(
    private walletService: WalletService,
    private configService: BotConfigService,
    private botEngineService: BotEngineService,
    private web3Service: Web3Service,
  ) { }

  // Wallet Management Endpoints
  @Post('wallets/generate')
  async generateWallets(@Body() { count }: { count: number }) {
    const wallets = await this.walletService.generateWallets(count);
    return {
      success: true,
      message: `Generated ${count} wallets`,
      data: wallets.map(w => ({ id: w.id, address: w.address, balance: w.balance }))
    };
  }

  @Post('wallets/distribute')
  async distributeToWallets(@Body() distributeDto: DistributeDto) {
    await this.walletService.distributeToWallets(
      distributeDto.totalAmount,
      distributeDto.minAmount,
      distributeDto.maxAmount
    );

    return {
      success: true,
      message: 'Distribution completed successfully'
    };
  }

  @Post('wallets/collect')
  async collectFromWallets() {
    await this.walletService.collectFromWallets();
    return {
      success: true,
      message: 'Collection completed successfully'
    };
  }

  @Get('wallets')
  async getWallets() {
    const wallets = await this.walletService.getWalletsWithRewards();
    return {
      success: true,
      data: wallets
    };
  }

  @Post('wallets/update-balances')
  async updateWalletBalances() {
    await this.walletService.updateWalletBalances();
    return {
      success: true,
      message: 'Wallet balances updated'
    };
  }

  @Post('wallets/:id/claim')
  async claimWalletRewards(@Param('id') walletId: number) {
    try {
      const result = await this.botEngineService.manualClaimForWallet(walletId);
      return {
        success: result.success,
        message: result.message,
        data: {
          totalClaimed: result.totalClaimed,
          claimedRounds: result.claimedRounds
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Post('wallets/:id/collect')
  async collectFromWallet(@Param('id') walletId: number) {
    try {
      const result = await this.walletService.collectFromWallet(walletId);
      return {
        success: true,
        message: 'Funds collected successfully',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Delete('wallets/:id')
  async removeWallet(@Param('id') walletId: number) {
    try {
      await this.walletService.removeWallet(walletId);
      return {
        success: true,
        message: 'Wallet removed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Add this endpoint to your controller for testing
  @Get('wallets/validate')
  async validateWallets() {
    const result = await this.walletService.validateWalletIntegrity();
    return {
      success: true,
      data: result
    };
  }

  // New Claim Management Endpoints
  @Get('claims/summary')
  async getClaimableRewardsSummary() {
    try {
      const summary = await this.botEngineService.getClaimableRewardsSummary();
      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Post('claims/auto-claim-all')
  async autoClaimAllWallets() {
    try {
      // This will trigger auto-claim for all wallets manually
      const wallets = await this.walletService.getWallets();
      let totalClaimed = 0;
      let successfulWallets = 0;
      let failedWallets = 0;

      for (const wallet of wallets) {
        try {
          const result = await this.botEngineService.manualClaimForWallet(wallet.id);
          if (result.success && (result.totalClaimed ?? 0) > 0) {
            totalClaimed += result.totalClaimed ?? 0;
            successfulWallets++;
          }
        } catch (error) {
          failedWallets++;
        }
      }

      return {
        success: true,
        message: `Auto-claim completed: ${successfulWallets} wallets claimed successfully, ${failedWallets} failed`,
        data: {
          totalClaimed,
          successfulWallets,
          failedWallets,
          totalWallets: wallets.length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('claims/wallet/:id')
  async getWalletClaimableRounds(@Param('id') walletId: number) {
    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) {
        return {
          success: false,
          message: 'Wallet not found'
        };
      }

      const walletKeypair = await this.walletService.getWalletKeypair(wallet);
      const claimableRounds = await this.web3Service.getClaimableRounds(walletKeypair);

      return {
        success: true,
        data: {
          walletAddress: wallet.address,
          claimableRounds: claimableRounds.length,
          estimatedTotalReward: claimableRounds.reduce((sum, round) => sum + round.estimatedReward, 0),
          rounds: claimableRounds
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Bot Configuration Endpoints
  @Get('config')
  async getConfig() {
    const config = await this.configService.getConfig();
    return {
      success: true,
      data: config
    };
  }

  @Post('config')
  async updateConfig(@Body() configDto: BotConfigDto) {
    const config = await this.configService.updateConfig(configDto);
    return {
      success: true,
      message: 'Bot configuration updated',
      data: config
    };
  }

  @Post('config/status')
  async updateStatus(@Body() { status }: { status: 'stopped' | 'running' | 'paused' }) {

    if (status === 'running') {
      await this.botEngineService.startBot();
    } else if (status === 'stopped') {
      await this.botEngineService.stopBot();
    }

    return {
      success: true,
      message: `Bot status updated to ${status}`,
    };
  }

  // Bot Control Endpoints
  @Post('start')
  async startBot() {
    await this.botEngineService.startBot();
    return {
      success: true,
      message: 'Bot started successfully'
    };
  }

  @Post('stop')
  async stopBot() {
    await this.botEngineService.stopBot();
    return {
      success: true,
      message: 'Bot stopped successfully'
    };
  }

  // Bot Status and History Endpoints
  @Get('status')
  async getBotStatus() {
    const status = await this.botEngineService.getBotStatus();
    return {
      success: true,
      data: status
    };
  }

  @Get('betting-history')
  async getBettingHistory() {
    const history = await this.botEngineService.getBettingHistory();
    return {
      success: true,
      data: history
    };
  }

  @Get('current-round')
  async getCurrentRound() {
    try {
      const roundInfo = await this.botEngineService.getCurrentRoundInfo();
      return {
        success: true,
        data: roundInfo
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('stats')
  async getStats() {
    try {
      const allTimeStats = await this.botEngineService.getRoundStats();
      const claimableSummary = await this.botEngineService.getClaimableRewardsSummary();

      return {
        success: true,
        data: {
          betting: allTimeStats,
          claimable: claimableSummary
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('stats/round/:roundId')
  async getRoundStats(@Param('roundId') roundId: number) {
    try {
      const stats = await this.botEngineService.getRoundStats(roundId);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}