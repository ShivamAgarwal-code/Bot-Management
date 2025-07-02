import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class BotConfigDto {
  @IsOptional()
  @IsNumber()
  betTimeFrom?: number;

  @IsOptional()
  @IsNumber()
  betTimeTo?: number;

  @IsOptional()
  @IsNumber()
  downBalanceFrom?: number;

  @IsOptional()
  @IsNumber()
  downBalanceTo?: number;

  @IsOptional()
  @IsNumber()
  upBalanceFrom?: number;

  @IsOptional()
  @IsNumber()
  upBalanceTo?: number;

  @IsOptional()
  @IsNumber()
  walletCountFrom?: number;

  @IsOptional()
  @IsNumber()
  walletCountTo?: number;

  @IsOptional()
  @IsNumber()
  minBetFrom?: number;

  @IsOptional()
  @IsNumber()
  minBetTo?: number;

  @IsOptional()
  @IsNumber()
  maxBetFrom?: number;

  @IsOptional()
  @IsNumber()
  maxBetTo?: number;

  @IsOptional()
  @IsNumber()
  epochFrom?: number;

  @IsOptional()
  @IsNumber()
  epochTo?: number;

  @IsOptional()
  status?: 'stopped' | 'running' | 'paused';
}