import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class WalletConfigDto {
  @IsNumber()
  @Min(1)
  @Max(10000)
  walletCount: number;

  @IsNumber()
  @Min(0.001)
  minBet: number;

  @IsNumber()
  @Min(0.001)
  maxBet: number;
}

export class DistributeDto {
  @IsNumber()
  @Min(0.001)
  totalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  maxAmount?: number;
}