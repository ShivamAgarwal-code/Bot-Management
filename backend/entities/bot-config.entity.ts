import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bot_config')
export class BotConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { default: 0 })
  walletCount: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0 })
  minBet: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0 })
  maxBet: number;

  @Column('int', { nullable: true })
  epochFrom: number;

  @Column('int', { nullable: true })
  epochTo: number;

  @Column('int', { default: 0 })
  betTimeFrom: number; // seconds from round start

  @Column('int', { default: 180 })
  betTimeTo: number; // seconds from round start

  @Column('decimal', { precision: 5, scale: 2, default: 1.0 })
  downBalanceFrom: number;

  @Column('decimal', { precision: 5, scale: 2, default: 2.0 })
  downBalanceTo: number;

  @Column('decimal', { precision: 5, scale: 2, default: 1.0 })
  upBalanceFrom: number;

  @Column('decimal', { precision: 5, scale: 2, default: 2.0 })
  upBalanceTo: number;

  @Column('int', { default: 1 })
  walletCountFrom: number;

  @Column('int', { default: 10 })
  walletCountTo: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0.01 })
  minBetFrom: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0.1 })
  minBetTo: number;

  @Column('decimal', { precision: 18, scale: 9, default: 0.1 })
  maxBetFrom: number;

  @Column('decimal', { precision: 18, scale: 9, default: 1.0 })
  maxBetTo: number;

  @Column({ default: 'stopped' })
  status: 'stopped' | 'running' | 'paused';

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}