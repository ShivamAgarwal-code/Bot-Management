import { Controller, Get, Post, Body, Put, Param } from '@nestjs/common';
import { WalletService } from '../services/wallet.service';
import { BotConfigService } from '../services/bot-config.service';
import { BotEngineService } from '../services/bot-engine.service';
import { DistributeDto } from '../dto/wallet-config.dto';
import { BotConfigDto } from '../dto/bot-config.dto';

@Controller('bot-management')
export class BotManagementController {
  constructor(
    private walletService: WalletService,
    private configService: BotConfigService,
    private botEngineService: BotEngineService,
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
    const wallets = await this.walletService.getWallets();
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
    const config = await this.configService.updateStatus(status);
    
    if (status === 'running') {
      await this.botEngineService.startBot();
    } else if (status === 'stopped') {
      await this.botEngineService.stopBot();
    }
    
    return {
      success: true,
      message: `Bot status updated to ${status}`,
      data: config
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
}