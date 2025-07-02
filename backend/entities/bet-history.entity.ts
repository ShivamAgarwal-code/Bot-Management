import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bet_history')
export class BetHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  walletAddress: string;

  @Column('int')
  epoch: number;

  @Column()
  direction: 'up' | 'down';

  @Column('decimal', { precision: 18, scale: 9 })
  amount: number;

  @Column('decimal', { precision: 18, scale: 9, nullable: true })
  payout: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'won' | 'lost';

  @Column('int')
  betTime: number; // seconds from round start

  @CreateDateColumn()
  createdAt: Date;
}