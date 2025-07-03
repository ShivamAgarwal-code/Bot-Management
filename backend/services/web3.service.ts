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
import * as idl from '../../types/sol_predictor.json';
import { AnchorProvider } from '@project-serum/anchor';

export interface BetResult {
  success: boolean;
  signature?: string;
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

      // Use the contract utils function
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

  async getWalletBalance(address: string): Promise<number> {
    try {
      const balance = await this.connection.getBalance(new PublicKey(address));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      this.logger.error(`Failed to get balance for ${address}:`, error);
      return 0;
    }
  }

  async claimPayout(walletKeypair: Keypair, roundId: number): Promise<BetResult> {
    try {
      const mockWallet = {
        publicKey: walletKeypair.publicKey,
        signTransaction: async (transaction: Transaction) => {
          transaction.partialSign(walletKeypair);
          return transaction;
        },
      };

      const signature = await this.claimPayoutOnChain(
        this.connection,
        this.programId,
        walletKeypair.publicKey,
        walletKeypair.publicKey,
        mockWallet.signTransaction,
        null,
        roundId
      );

      return { success: true, signature };
    } catch (error) {
      this.logger.error(`Failed to claim payout:`, error);
      return { success: false, error: error.message };
    }
  }

  private async claimPayoutOnChain(
    connection: Connection,
    programId: PublicKey,
    contractAddress: PublicKey,
    userPubkey: PublicKey,
    signTransaction: (transaction: Transaction) => Promise<Transaction>,
    sendTransaction: any,
    roundId: number
  ): Promise<string> {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
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

    const provider = new anchor.AnchorProvider(
      connection,
      { publicKey: userPubkey, signTransaction } as any,
      { commitment: "confirmed" }
    );

    const program = new anchor.Program(idl as any, programId, provider);

    const roundPda = getRoundPda(roundId);
    const userBetPda = getUserBetPda(userPubkey, roundId);
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      programId
    );

    const tx = await program.methods
      .claimPayout(new anchor.BN(roundId))
      .accounts({
        config: configPda,
        round: roundPda,
        userBet: userBetPda,
        user: userPubkey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    const signedTx = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      { preflightCommitment: "processed" }
    );

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
}