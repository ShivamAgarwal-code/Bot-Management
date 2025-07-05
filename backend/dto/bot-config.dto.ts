import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class BotConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  minBet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  maxBet?: number;

  @IsOptional()
  @IsNumber()
  betTimeFrom?: number;

  @IsOptional()
  @IsNumber()
  betTimeTo?: number;

  @IsOptional()
  @IsNumber()
  upDownBalanceFrom?: number;

  @IsOptional()
  @IsNumber()
  upDownBalanceTo?: number;

  @IsOptional()
  @IsNumber()
  walletCountFrom?: number;

  @IsOptional()
  @IsNumber()
  walletCountTo?: number;

  @IsOptional()
  @IsNumber()
  epochFrom?: number;

  @IsOptional()
  @IsNumber()
  epochTo?: number;

  @IsOptional()
  status?: 'stopped' | 'running' | 'paused';
}