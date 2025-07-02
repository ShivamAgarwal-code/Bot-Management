import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotWallet } from './entities/wallet.entity';
import { BotConfig } from './entities/bot-config.entity';
import { BetHistory } from './entities/bet-history.entity';
import { WalletService } from './services/wallet.service';
import { BotConfigService } from './services/bot-config.service';
import { BotEngineService } from './services/bot-engine.service';
import { BotManagementController } from './controllers/bot-management.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotWallet, BotConfig, BetHistory])
  ],
  controllers: [BotManagementController],
  providers: [WalletService, BotConfigService, BotEngineService],
  exports: [WalletService, BotConfigService, BotEngineService],
})
export class BotManagementModule {}