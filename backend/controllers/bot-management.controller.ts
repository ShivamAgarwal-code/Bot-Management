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
  ) {}

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
      const result = await this.walletService.claimWalletRewards(walletId);
      return {
        success: true,
        message: 'Rewards claimed successfully',
        data: result
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
}