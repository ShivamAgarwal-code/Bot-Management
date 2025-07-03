import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bot_config')
export class BotConfig {
  @PrimaryGeneratedColumn()
  id: number;

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
  upDownBalanceFrom: number;

  @Column('decimal', { precision: 5, scale: 2, default: 2.0 })
  upDownBalanceTo: number;

  @Column('int', { default: 1 })
  walletCountFrom: number;

  @Column('int', { default: 10 })
  walletCountTo: number;

  @Column({ default: 'stopped' })
  status: 'stopped' | 'running' | 'paused';

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}