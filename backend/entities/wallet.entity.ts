import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bot_wallets')
export class BotWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  address: string;

  @Column('decimal', { precision: 18, scale: 9 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  privateKey: string; // Encrypted

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}