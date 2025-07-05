import { Injectable, Logger } from '@nestjs/common';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { ConfigService } from '@nestjs/config';
import { BLOCKCHAIN_CONFIG } from '../config/blockchain.config';
import * as idl from '../idl/idl.json';
import { AnchorProvider } from '@project-serum/anchor';

export interface BetResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  signature?: string;
  amount?: number;
  error?: string;
}

export interface RoundInfo {
  number: number;
  startTime: number;
  lockTime: number;
  closeTime: number;
  lockPrice: number;
  endPrice: number;
  isActive: boolean;
  totalBullAmount: number;
  totalBearAmount: number;
  totalAmount: number;
  rewardBaseCalAmount: number;
  rewardAmount: number;
}

export interface ClaimableRound {
  roundId: number;
  betAmount: number;
  direction: 'up' | 'down';
  estimatedReward: number;
  isWinning: boolean;
}

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  private connection: Connection;
  private programId: PublicKey;

  constructor(private configService: ConfigService) {
    this.connection = new Connection(BLOCKCHAIN_CONFIG.RPC_URL, BLOCKCHAIN_CONFIG.CONFIRMATION_COMMITMENT);
    this.programId = new PublicKey(BLOCKCHAIN_CONFIG.PROGRAM_ID);
  }

  async placeBet(
    walletKeypair: Keypair,
    roundId: number,
    direction: boolean, // true for UP, false for DOWN
    amount: number
  ): Promise<BetResult> {
    try {
      this.logger.log(`Placing bet: Round ${roundId}, Direction: ${direction ? 'UP' : 'DOWN'}, Amount: ${amount} SOL`);

      const signature = await this.placeBetOnChain(
        this.connection,
        this.programId,
        walletKeypair,
        roundId,
        direction,
        amount
      );

      if (signature) {
        this.logger.log(`Bet placed successfully. Signature: ${signature}`);
        return { success: true, signature };
      } else {
        return { success: false, error: 'Transaction returned null signature' };
      }

    } catch (error) {
      this.logger.error(`Failed to place bet:`, error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  private async placeBetOnChain(
    connection: Connection,
    programId: PublicKey,
    walletKeypair: Keypair,
    roundId: number,
    direction: boolean,
    amount: number
  ): Promise<string | null> {
    try {
      // Derive PDAs (Program Derived Addresses)
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );

      const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programId
      );

      const getRoundPda = (roundNumber: number) =>
        PublicKey.findProgramAddressSync(
          [
            Buffer.from("round"),
            new anchor.BN(roundNumber).toArrayLike(Buffer, "le", 8),
          ],
          programId
        )[0];

      const getUserBetPda = (user: PublicKey, roundNumber: number) =>
        PublicKey.findProgramAddressSync(
          [
            Buffer.from("user_bet"),
            user.toBuffer(),
            new anchor.BN(roundNumber).toArrayLike(Buffer, "le", 8),
          ],
          programId
        )[0];

      const provider = new AnchorProvider(connection, new anchor.Wallet(walletKeypair), {});
      const program = new anchor.Program(idl as any, programId, provider);
      const roundPda = getRoundPda(roundId);
      const userBetPda = getUserBetPda(walletKeypair.publicKey, roundId);

      const tx = await program.methods
        .placeBet(
          new anchor.BN(amount * LAMPORTS_PER_SOL),
          direction,
          new anchor.BN(roundId)
        )
        .accounts({
          config: configPda,
          round: roundPda,
          userBet: userBetPda,
          user: walletKeypair.publicKey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();

      return tx;

    } catch (error) {
      this.logger.error("Error in placeBetOnChain:", error);

      if (error.message?.includes("This transaction has already been processed")) {
        this.logger.log("Transaction already processed");
        return null;
      }

      throw error;
    }
  }

  async getClaimableRounds(walletKeypair: Keypair): Promise<ClaimableRound[]> {
    try {
      const provider = new AnchorProvider(this.connection, new anchor.Wallet(walletKeypair), {
        commitment: BLOCKCHAIN_CONFIG.CONFIRMATION_COMMITMENT
      });

      const program = new anchor.Program(idl as any, this.programId, provider);
      
      // Get current round to determine which rounds can be claimed
      const currentRound = await this.getCurrentRound(program);
      
      // Get all user bets for this wallet
      const userBets = await program.account.userBet.all([
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: walletKeypair.publicKey.toBase58(),
          },
        },
      ]);

      const claimableRounds: ClaimableRound[] = [];

      for (const betAccount of userBets) {
        const bet = betAccount.account as any;
        const roundId = bet.roundNumber.toNumber();
        const claimed = bet.claimed;
        const isBull = bet.predictBull;
        const betAmount = bet.amount.toNumber() / LAMPORTS_PER_SOL;

        // Skip if already claimed or if round is too recent
        if (claimed || roundId >= currentRound - 1) {
          continue;
        }

        try {
          const [roundPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('round'), new anchor.BN(roundId).toArrayLike(Buffer, 'le', 8)],
            this.programId
          );

          const round = await program.account.round.fetch(roundPda) as any;
          const roundEnded = !round.isActive && !!round.lockPrice && !!round.endPrice;

          if (!roundEnded) continue;

          // Determine if the bet won
          const lockPrice = round.lockPrice.toNumber();
          const endPrice = round.endPrice.toNumber();
          const won = isBull ? endPrice > lockPrice : endPrice < lockPrice;

          if (won) {
            // Calculate estimated reward
            const totalPool = round.totalAmount.toNumber() / LAMPORTS_PER_SOL;
            const winningPool = isBull ? round.totalBullAmount.toNumber() / LAMPORTS_PER_SOL : round.totalBearAmount.toNumber() / LAMPORTS_PER_SOL;
            const estimatedReward = winningPool > 0 ? (betAmount * totalPool) / winningPool : betAmount;

            claimableRounds.push({
              roundId,
              betAmount,
              direction: isBull ? 'up' : 'down',
              estimatedReward,
              isWinning: true
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch round ${roundId} data:`, error.message);
        }
      }

      return claimableRounds.sort((a, b) => a.roundId - b.roundId);

    } catch (error) {
      this.logger.error('Failed to get claimable rounds:', error);
      return [];
    }
  }

  async claimPayout(walletKeypair: Keypair, roundId: number): Promise<ClaimResult> {
    try {
      this.logger.log(`Claiming payout for round ${roundId} with wallet ${walletKeypair.publicKey.toString()}`);

      const balanceBefore = await this.getWalletBalance(walletKeypair.publicKey.toString());

      const signature = await this.claimPayoutOnChain(
        this.connection,
        this.programId,
        walletKeypair,
        roundId
      );

      if (signature) {
        // Wait a bit for the transaction to settle
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const balanceAfter = await this.getWalletBalance(walletKeypair.publicKey.toString());
        const claimedAmount = balanceAfter - balanceBefore;

        this.logger.log(`Payout claimed successfully. Signature: ${signature}, Amount: ${claimedAmount.toFixed(6)} SOL`);
        
        return { 
          success: true, 
          signature, 
          amount: claimedAmount 
        };
      } else {
        return { success: false, error: 'Transaction returned null signature' };
      }

    } catch (error) {
      this.logger.error(`Failed to claim payout:`, error);

      if (error.message?.includes("already claimed")) {
        return { success: false, error: 'Rewards already claimed' };
      }

      if (error.message?.includes("No rewards available")) {
        return { success: false, error: 'No rewards available for this round' };
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred during claim'
      };
    }
  }

  private async claimPayoutOnChain(
    connection: Connection,
    programId: PublicKey,
    walletKeypair: Keypair,
    roundId: number
  ): Promise<string | null> {
    try {
      // Derive PDAs
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );

      const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programId
      );

      const getRoundPda = (roundNumber: number) =>
        PublicKey.findProgramAddressSync(
          [
            Buffer.from("round"),
            new anchor.BN(roundNumber).toArrayLike(Buffer, "le", 8),
          ],
          programId
        )[0];

      const getUserBetPda = (user: PublicKey, roundNumber: number) =>
        PublicKey.findProgramAddressSync(
          [
            Buffer.from("user_bet"),
            user.toBuffer(),
            new anchor.BN(roundNumber).toArrayLike(Buffer, "le", 8),
          ],
          programId
        )[0];

      const provider = new AnchorProvider(connection, new anchor.Wallet(walletKeypair), {
        commitment: BLOCKCHAIN_CONFIG.CONFIRMATION_COMMITMENT
      });

      const program = new anchor.Program(idl as any, programId, provider);
      const roundPda = getRoundPda(roundId);
      const userBetPda = getUserBetPda(walletKeypair.publicKey, roundId);

      // Check if the bet exists and is claimable
      try {
        const userBetAccount: any = await program.account.userBet.fetch(userBetPda);
        if (userBetAccount?.claimed) {
          throw new Error('Rewards already claimed for this round');
        }
      } catch (error) {
        if (error.message?.includes('already claimed')) {
          throw error;
        }
        throw new Error('No bet found for this round');
      }

      const tx = await program.methods
        .claimPayout(new anchor.BN(roundId))
        .accounts({
          config: configPda,
          round: roundPda,
          userBet: userBetPda,
          user: walletKeypair.publicKey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();

      return tx;

    } catch (error) {
      this.logger.error("Error in claimPayoutOnChain:", error);

      if (error.message?.includes("This transaction has already been processed")) {
        this.logger.log("Claim transaction already processed");
        return null;
      }

      throw error;
    }
  }

  async claimAllAvailableRewards(walletKeypair: Keypair): Promise<{ 
    totalClaimed: number; 
    successfulClaims: number; 
    failedClaims: number; 
    results: ClaimResult[] 
  }> {
    try {
      const claimableRounds = await this.getClaimableRounds(walletKeypair);
      
      if (claimableRounds.length === 0) {
        this.logger.log(`No claimable rounds found for wallet ${walletKeypair.publicKey.toString()}`);
        return { totalClaimed: 0, successfulClaims: 0, failedClaims: 0, results: [] };
      }

      this.logger.log(`Found ${claimableRounds.length} claimable rounds for wallet ${walletKeypair.publicKey.toString()}`);

      const results: ClaimResult[] = [];
      let totalClaimed = 0;
      let successfulClaims = 0;
      let failedClaims = 0;

      // Process claims sequentially to avoid RPC rate limits
      for (const claimableRound of claimableRounds) {
        try {
          // Add small delay between claims to avoid overwhelming the RPC
          if (results.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const result = await this.claimPayout(walletKeypair, claimableRound.roundId);
          results.push(result);

          if (result.success && result.amount) {
            totalClaimed += result.amount;
            successfulClaims++;
            this.logger.log(`✅ Successfully claimed ${result.amount.toFixed(6)} SOL from round ${claimableRound.roundId}`);
          } else {
            failedClaims++;
            this.logger.warn(`❌ Failed to claim from round ${claimableRound.roundId}: ${result.error}`);
          }
        } catch (error) {
          failedClaims++;
          const errorResult: ClaimResult = { 
            success: false, 
            error: error.message || 'Unknown error' 
          };
          results.push(errorResult);
          this.logger.error(`❌ Error claiming from round ${claimableRound.roundId}:`, error);
        }
      }

      this.logger.log(`🎉 Claim summary for wallet ${walletKeypair.publicKey.toString()}: ${successfulClaims} successful, ${failedClaims} failed, ${totalClaimed.toFixed(6)} SOL total claimed`);

      return { totalClaimed, successfulClaims, failedClaims, results };

    } catch (error) {
      this.logger.error('Failed to claim all available rewards:', error);
      return { totalClaimed: 0, successfulClaims: 0, failedClaims: 0, results: [] };
    }
  }

  private async getCurrentRound(program: anchor.Program): Promise<number> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], this.programId);
      const config = await program.account.config.fetch(configPda) as { currentRound: anchor.BN };
      return Number(config.currentRound);
    } catch (error) {
      this.logger.error('Failed to get current round:', error);
      return 0;
    }
  }

  async getWalletBalance(address: string): Promise<number> {
    try {
      const balance = await this.connection.getBalance(new PublicKey(address));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      this.logger.error(`Failed to get balance for ${address}:`, error);
      return 0;
    }
  }

  // Utility method to check if a specific round is claimable for a wallet
  async isRoundClaimable(walletKeypair: Keypair, roundId: number): Promise<boolean> {
    try {
      const claimableRounds = await this.getClaimableRounds(walletKeypair);
      return claimableRounds.some(round => round.roundId === roundId);
    } catch (error) {
      this.logger.error(`Failed to check if round ${roundId} is claimable:`, error);
      return false;
    }
  }
}