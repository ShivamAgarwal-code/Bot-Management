import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotWallet } from './entities/wallet.entity';
import { BotConfig } from './entities/bot-config.entity';
import { BetHistory } from './entities/bet-history.entity';
import { WalletService } from './services/wallet.service';
import { BotConfigService } from './services/bot-config.service';
import { BotEngineService } from './services/bot-engine.service';
import { Web3Service } from './services/web3.service';
import { BotManagementController } from './controllers/bot-management.controller';
import { AdminDashboardModule } from 'src/admin-dashboard/admin-dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotWallet, BotConfig, BetHistory]),
    AdminDashboardModule,
    ScheduleModule.forRoot()
  ],
  controllers: [BotManagementController],
  providers: [WalletService, BotConfigService, BotEngineService, Web3Service],
  exports: [WalletService, BotConfigService, BotEngineService, Web3Service],
})
export class BotManagementModule {}