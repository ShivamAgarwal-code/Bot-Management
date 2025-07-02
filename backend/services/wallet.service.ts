import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotWallet } from '../entities/wallet.entity';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import { Web3Service } from './web3.service';
import { BLOCKCHAIN_CONFIG } from '../config/blockchain.config';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private connection: Connection;
  private mainWallet: Keypair;

  constructor(
    @InjectRepository(BotWallet)
    private walletRepository: Repository<BotWallet>,
    private configService: ConfigService,
    private web3Service: Web3Service,
  ) {
    this.connection = new Connection(BLOCKCHAIN_CONFIG.RPC_URL, BLOCKCHAIN_CONFIG.CONFIRMATION_COMMITMENT);
    
    // Initialize main wallet from private key in .env
    const mainPrivateKey = this.configService.get<string>('MAIN_WALLET_PRIVATE_KEY');
    if (!mainPrivateKey) {
      throw new Error('MAIN_WALLET_PRIVATE_KEY not found in environment variables');
    }
    this.mainWallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(mainPrivateKey)));
  }

  private encryptPrivateKey(privateKey: string): string {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY not found in environment variables');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Store IV with encrypted data (IV:encrypted)
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptPrivateKey(encryptedKey: string): string {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY not found in environment variables');
    }
    const [ivHex, encrypted] = encryptedKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async generateWallets(count: number): Promise<BotWallet[]> {
    this.logger.log(`Generating ${count} wallets`);
    
    const wallets: BotWallet[] = [];
    
    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate();
      const wallet = new BotWallet();
      wallet.address = keypair.publicKey.toString();
      wallet.balance = 0;
      wallet.privateKey = this.encryptPrivateKey(JSON.stringify(Array.from(keypair.secretKey)));
      
      wallets.push(wallet);
    }

    return await this.walletRepository.save(wallets);
  }

  async getWalletKeypair(wallet: BotWallet): Promise<Keypair> {
    try {
      const privateKeyArray = JSON.parse(this.decryptPrivateKey(wallet.privateKey));
      return Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    } catch (error) {
      this.logger.error(`Failed to decrypt wallet ${wallet.address}:`, error);
      throw new Error(`Failed to decrypt wallet ${wallet.address}`);
    }
  }

  async distributeToWallets(totalAmount: number, minAmount?: number, maxAmount?: number): Promise<void> {
    const wallets = await this.walletRepository.find({ where: { isActive: true } });
    
    if (wallets.length === 0) {
      throw new BadRequestException('No active wallets found. Generate wallets first.');
    }

    this.logger.log(`Distributing ${totalAmount} SOL to ${wallets.length} wallets`);

    // Calculate distribution amounts
    const distributions = this.calculateDistributions(wallets.length, totalAmount, minAmount, maxAmount);
    
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const amount = distributions[i];
      
      try {
        await this.transferToWallet(wallet.address, amount);
        
        // Update wallet balance in database
        wallet.balance = Number(wallet.balance) + amount;
        await this.walletRepository.save(wallet);
        
        this.logger.log(`Transferred ${amount} SOL to ${wallet.address}`);
      } catch (error) {
        this.logger.error(`Failed to transfer to ${wallet.address}:`, error);
      }
    }
  }

  private calculateDistributions(walletCount: number, totalAmount: number, minAmount?: number, maxAmount?: number): number[] {
    const distributions: number[] = [];
    let remainingAmount = totalAmount;
    
    const min = minAmount || totalAmount / walletCount * 0.5;
    const max = maxAmount || totalAmount / walletCount * 1.5;
    
    for (let i = 0; i < walletCount - 1; i++) {
      const maxPossible = Math.min(max, remainingAmount - (walletCount - i - 1) * min);
      const amount = Math.random() * (maxPossible - min) + min;
      
      distributions.push(Number(amount.toFixed(9)));
      remainingAmount -= amount;
    }
    
    // Last wallet gets remaining amount
    distributions.push(Number(remainingAmount.toFixed(9)));
    
    return distributions;
  }

  private async transferToWallet(toAddress: string, amount: number): Promise<void> {
    const transaction = new Transaction();
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: this.mainWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const signature = await this.connection.sendTransaction(transaction, [this.mainWallet]);
    await this.connection.confirmTransaction(signature);
  }

  async collectFromWallets(): Promise<void> {
    const wallets = await this.walletRepository.find({ 
      where: { isActive: true }
    });

    this.logger.log(`Collecting from ${wallets.length} wallets`);

    for (const wallet of wallets) {
      if (wallet.balance > 0.001) { // Leave some for transaction fees
        try {
          const keypair = await this.getWalletKeypair(wallet);
          
          const balance = await this.connection.getBalance(keypair.publicKey);
          const amountToTransfer = Math.max(0, balance - 5000); // Leave 5000 lamports for fees
          
          if (amountToTransfer > 0) {
            const transaction = new Transaction();
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: this.mainWallet.publicKey,
                lamports: amountToTransfer,
              })
            );

            const signature = await this.connection.sendTransaction(transaction, [keypair]);
            await this.connection.confirmTransaction(signature);
            
            // Update database
            wallet.balance = 0;
            await this.walletRepository.save(wallet);
            
            this.logger.log(`Collected ${amountToTransfer / LAMPORTS_PER_SOL} SOL from ${wallet.address}`);
          }
        } catch (error) {
          this.logger.error(`Failed to collect from ${wallet.address}:`, error);
        }
      }
    }
  }

  async getWallets(): Promise<BotWallet[]> {
    return await this.walletRepository.find({ 
      where: { isActive: true },
      select: ['id', 'address', 'balance', 'isActive', 'createdAt', 'updatedAt']
    });
  }

  async updateWalletBalances(): Promise<void> {
    const wallets = await this.walletRepository.find({ where: { isActive: true } });
    
    for (const wallet of wallets) {
      try {
        const balance = await this.web3Service.getWalletBalance(wallet.address);
        wallet.balance = balance;
        await this.walletRepository.save(wallet);
      } catch (error) {
        this.logger.error(`Failed to update balance for ${wallet.address}:`, error);
      }
    }
  }
}