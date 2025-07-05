import { useState, useEffect } from "react";
import { FaPause, FaStop } from "react-icons/fa6";
import { message, Avatar } from "antd";
import { RiRestartLine } from "react-icons/ri";
import { HiMiniPlayPause } from "react-icons/hi2";
import axios from "axios";
import avatarIcon from "../../assets/Avatar.png";
import NumberFlow from '@number-flow/react'
import solIcon from "../../assets/sol-icon.png";
import { BiCoin } from "react-icons/bi";
import { FiRefreshCw } from "react-icons/fi";
import { FaTrash } from "react-icons/fa6";
import { DotLoader } from "react-spinners";
import { ArrowDown, ArrowUp } from "lucide-react";
import toast from "react-hot-toast";

interface BotWallet {
  id: number;
  address: string;
  balance: number;
  unclaimedRewards: number; // Add this line
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoundInfo {
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
}

interface ClaimableSummary {
  totalWalletsWithRewards: number;
  totalClaimableAmount: number;
  totalClaimableRounds: number;
  walletSummaries: Array<{
    walletId: number;
    walletAddress: string;
    claimableRounds: number;
    estimatedRewards: number;
  }>;
}

interface BotConfig {
  id: number;
  minBet: number;
  maxBet: number;
  epochFrom: number;
  epochTo: number;
  betTimeFrom: number;
  betTimeTo: number;
  upDownBalanceFrom: number;
  upDownBalanceTo: number;
  walletCountFrom: number;
  walletCountTo: number;
  status: "stopped" | "running" | "paused";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BetHistory {
  id: number;
  walletAddress: string;
  epoch: number;
  direction: 'up' | 'down';
  amount: number;
  payout?: number;
  status: 'pending' | 'won' | 'lost';
  betTime: number;
  createdAt: string;
}

const API_BASE_URL = "http://localhost:4000/bot-management";

export default function BotManagement() {
  const [config, setConfig] = useState<BotConfig>({
    id: 0,
    minBet: 0.001,      // Change from 0
    maxBet: 0.01,       // Change from 0
    epochFrom: 0,
    epochTo: 0,
    betTimeFrom: 0,
    betTimeTo: 180,
    walletCountFrom: 1,
    walletCountTo: 10,
    upDownBalanceFrom: 1,  // Change from 0
    upDownBalanceTo: 2,    // Change from 0
    status: "stopped",
    isActive: true,
    createdAt: "",
    updatedAt: ""
  });

  const [wallets, setWallets] = useState<BotWallet[]>([]);
  const [claimableSummary, setClaimableSummary] = useState<ClaimableSummary>({
    totalWalletsWithRewards: 0,
    totalClaimableAmount: 0,
    totalClaimableRounds: 0,
    walletSummaries: []
  });
  const [betHistory, setBetHistory] = useState<BetHistory[]>([]);
  const [currentRound, setCurrentRound] = useState<RoundInfo | null>(null);
  const [livePrice, setLivePrice] = useState(245.8372);
  const [distributionConfig, setDistributionConfig] = useState({
    totalAmount: "",
    minAmount: "",
    maxAmount: ""
  });
  const [generateWalletCount, setGenerateWalletCount] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);

  const [botStatus, setBotStatus] = useState({
    isRunning: false,
    status: 'stopped',
    currentRoundId: 0,
    activeWallets: 0,
    totalWalletBalance: 0,
    recentBets: 0,
    claimableRewards: {
      totalWalletsWithRewards: 0,
      totalClaimableAmount: 0,
      totalClaimableRounds: 0
    },
    config: {
      walletCountRange: '',
      betAmountRange: '',
      betTimeRange: '',
      epochRange: ''
    }
  });

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) return 120;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadClaimableSummary();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const priceInterval = setInterval(() => {
      setLivePrice(prev => {
        const change = (Math.random() - 0.5) * 2; // Random change between -1 and 1
        return Number((prev + change).toFixed(4));
      });
    }, 2000);

    return () => clearInterval(priceInterval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadBotStatus();
    }, 15000); // Refresh every 15 seconds

    return () => clearInterval(interval);
  }, []);

  // Load initial data
  useEffect(() => {
    loadConfig();
    loadWallets();
    loadBettingHistory();
    loadCurrentRound();
    loadClaimableSummary();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/config`);
      if (response.data.success) {
        setConfig(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      message.error("Failed to load bot configuration");
    }
  };

  const loadBotStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/status`);
      if (response.data.success && response.data.data) {
        setBotStatus(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load bot status:", error);
      // Don't update state on error to keep default values
    }
  };

  const loadBettingHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/betting-history`);
      if (response.data.success) {
        setBetHistory(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load betting history:", error);
    }
  };

  const loadClaimableSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/claims/summary`);
      if (response.data.success && response.data.data) {
        setClaimableSummary(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load claimable summary:", error);
      // Keep existing state on error
    }
  };

  const handleAutoClaimAll = async () => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/claims/auto-claim-all`);
      if (response.data.success) {
        toast.success(`Auto-claim completed: ${response.data.data.totalClaimed.toFixed(6)} SOL claimed from ${response.data.data.successfulWallets} wallets!`);
        await loadWallets();
        await loadClaimableSummary();
      }
    } catch (error) {
      console.error("Failed to auto-claim all:", error);
      toast.error("Failed to auto-claim rewards");
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWalletRewards = async (walletId: number) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/${walletId}/claim`);
      if (response.data.success) {
        if (response.data.data.totalClaimed > 0) {
          toast.success(`Successfully claimed ${response.data.data.totalClaimed.toFixed(6)} SOL from ${response.data.data.claimedRounds} rounds!`);
        } else {
          toast("No claimable rewards found for this wallet");
        }
        await loadWallets();
        await loadClaimableSummary();
      }
    } catch (error) {
      console.error("Failed to claim wallet rewards:", error);
      toast.error("Failed to claim rewards");
    } finally {
      setLoading(false);
    }
  };


  const loadCurrentRound = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/current-round`);
      if (response.data.success) {
        setCurrentRound(response.data.data);
      }
    } catch (error) {
      console.error("Failed to load current round:", error);
    }
  };

  // 7. Update loadWallets function
  const loadWallets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/wallets`);
      if (response.data.success) {
        setWallets(
          response.data.data.map((w: any) => ({
            ...w,
            balance: Number(w.balance) || 0,
            unclaimedRewards: Number(w.unclaimedRewards) || 0, // Add this line
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load wallets:", error);
      message.error("Failed to load wallets");
    }
  };

  // 8. Add new wallet action functions
  const handleClaimRewards = async (walletId: number) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/${walletId}/claim`);
      if (response.data.success) {
        message.success("Rewards claimed successfully!");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to claim rewards:", error);
      message.error("Failed to claim rewards");
    } finally {
      setLoading(false);
    }
  };

  const handleCollectFromWallet = async (walletId: number) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/${walletId}/collect`);
      if (response.data.success) {
        message.success("Funds collected successfully!");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to collect funds:", error);
      message.error("Failed to collect funds");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveWallet = async (walletId: number) => {
    try {
      setLoading(true);
      const response = await axios.delete(`${API_BASE_URL}/wallets/${walletId}`);
      if (response.data.success) {
        message.success("Wallet removed successfully!");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to remove wallet:", error);
      message.error("Failed to remove wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (field: keyof BotConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfig(prev => ({
      ...prev,
      [field]: field.includes('From') || field.includes('To') || field.includes('Count') || field.includes('Bet') || field.includes('Balance') || field.includes('epoch')
        ? Number(value) || 0
        : value
    }));
  };

  const handleDistributionChange = (field: keyof typeof distributionConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDistributionConfig(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleSetConfig = async () => {
    try {
      setLoading(true);

      const response = await axios.post(`${API_BASE_URL}/config`, {
        betTimeFrom: Number(config.betTimeFrom),
        betTimeTo: Number(config.betTimeTo),
        upDownBalanceFrom: Number(config.upDownBalanceFrom),
        upDownBalanceTo: Number(config.upDownBalanceTo),
        walletCountFrom: Number(config.walletCountFrom),
        walletCountTo: Number(config.walletCountTo),
        minBet: Number(config.minBet),
        maxBet: Number(config.maxBet),
        epochFrom: Number(config.epochFrom),
        epochTo: Number(config.epochTo),
        status: config.status,
      });
      if (response.data.success) {
        toast.success("Bot configuration updated successfully!");
        setConfig(response.data.data);
      }
    } catch (error) {
      console.error("Failed to update config:", error);
      toast.error("Failed to update bot configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: "stopped" | "running" | "paused") => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/config/status`, { status: newStatus });
      if (response.data.success) {
        message.success(`Bot status updated to ${newStatus}`);
        setConfig(prev => ({ ...prev, status: newStatus }));
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      message.error("Failed to update bot status");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWallets = async () => {
    if (!generateWalletCount || Number(generateWalletCount) <= 0) {
      message.error("Please enter a valid wallet count");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/generate`, {
        count: Number(generateWalletCount)
      });

      if (response.data.success) {
        message.success(`Generated ${generateWalletCount} wallets successfully!`);
        setGenerateWalletCount("");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to generate wallets:", error);
      message.error("Failed to generate wallets");
    } finally {
      setLoading(false);
    }
  };

  const handleDistribute = async () => {
    if (!distributionConfig.totalAmount || Number(distributionConfig.totalAmount) <= 0) {
      message.error("Please enter a valid total amount");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        totalAmount: Number(distributionConfig.totalAmount),
        ...(distributionConfig.minAmount && { minAmount: Number(distributionConfig.minAmount) }),
        ...(distributionConfig.maxAmount && { maxAmount: Number(distributionConfig.maxAmount) })
      };

      const response = await axios.post(`${API_BASE_URL}/wallets/distribute`, payload);

      if (response.data.success) {
        message.success("Funds distributed successfully!");
        setDistributionConfig({ totalAmount: "", minAmount: "", maxAmount: "" });
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to distribute funds:", error);
      message.error("Failed to distribute funds");
    } finally {
      setLoading(false);
    }
  };

  const handleCollect = async () => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/collect`);

      if (response.data.success) {
        message.success("Funds collected successfully!");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to collect funds:", error);
      message.error("Failed to collect funds");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBalances = async () => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/wallets/update-balances`);

      if (response.data.success) {
        message.success("Wallet balances updated!");
        await loadWallets();
      }
    } catch (error) {
      console.error("Failed to update balances:", error);
      message.error("Failed to update wallet balances");
    } finally {
      setLoading(false);
    }
  };

  const getStatusButtonStyle = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-500 hover:bg-green-600";
      case "paused":
        return "bg-yellow-500 hover:bg-yellow-600";
      case "stopped":
        return "bg-red-500 hover:bg-red-600";
      default:
        return "bg-gray-500 hover:bg-gray-600";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <FaPause className="mr-2" />;
      case "paused":
        return <HiMiniPlayPause className="mr-2" />;
      case "stopped":
        return <RiRestartLine className="mr-2" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-12 p-6 min-h-screen text-white">
      <h1 className="text-3xl font-semibold">Bot Management</h1>

      {/* Wallets Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-xl font-bold">Wallets</h2>

        <div className="flex flex-col lg:flex-row gap-6 p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a]">
          {/* LEFT PANEL */}
          <div className="flex-1 flex flex-col gap-8 min-w-[300px]">
            <div className="space-y-6">
              {/* Generate Wallets */}
              <div className="flex flex-col gap-5">
                <label className="text-white font-semibold">Generate Wallets</label>
                <input
                  type="number"
                  placeholder="Enter wallet count"
                  value={generateWalletCount}
                  onChange={(e) => setGenerateWalletCount(e.target.value)}
                  className="w-full glass-card placeholder-white placeholder:font-semibold text-white rounded-full py-3 px-4 pr-10 focus:outline-none"
                />
              </div>

              {/* Distribution Configuration */}
              <div className="flex flex-col gap-5">
                <label className="text-white font-semibold">Total Amount to Distribute</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="Enter total amount"
                    value={distributionConfig.totalAmount}
                    onChange={handleDistributionChange("totalAmount")}
                    className="w-full placeholder-white placeholder:font-semibold glass-card text-white rounded-full py-3 px-4 pr-10 focus:outline-none"
                  />
                  <div className="absolute right-4 flex items-center gap-1 text-white">
                    <img src={solIcon} alt="SOL" className="w-4 h-4" />
                    <span className="text-sm font-semibold">SOL</span>
                  </div>
                </div>
              </div>

              {/* Min/Max Distribution Amounts */}
              {[
                { label: "Minimum Distribution", key: "minAmount" },
                { label: "Maximum Distribution", key: "maxAmount" },
              ].map(({ label, key }) => (
                <div key={key} className="flex flex-col gap-5">
                  <label className="text-white font-semibold">{label}</label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.001"
                      placeholder="Enter amount (optional)"
                      value={distributionConfig[key as keyof typeof distributionConfig]}
                      onChange={handleDistributionChange(key as keyof typeof distributionConfig)}
                      className="w-full placeholder-white placeholder:font-semibold glass-card text-white rounded-full py-3 px-4 pr-10 focus:outline-none"
                    />
                    <div className="absolute right-4 flex items-center gap-1 text-white">
                      <img src={solIcon} alt="SOL" className="w-4 h-4" />
                      <span className="text-sm font-semibold">SOL</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Wallet Management Buttons */}
            <div className="flex flex-col gap-4 pt-2 w-full">
              <button
                onClick={handleGenerateWallets}
                disabled={loading}
                className="yellow-card py-3 rounded-full text-center flex items-center justify-center"
              >
                {loading ? <DotLoader size={20} color="white" /> : "Generate Wallets"}
              </button>
              <button
                onClick={handleDistribute}
                disabled={loading}
                className="red-card py-3 rounded-full text-center flex items-center justify-center"
              >
                {loading ? <DotLoader size={20} color="white" /> : "Distribute"}
              </button>
              <button
                onClick={handleCollect}
                disabled={loading}
                className="green-card py-3 rounded-full text-center flex items-center justify-center"
              >
                {loading ? <DotLoader size={20} color="white" /> : "Collect"}
              </button>
              <button
                onClick={handleUpdateBalances}
                disabled={loading}
                className="blue-card py-3 rounded-full text-center flex items-center justify-center"
              >
                {loading ? <DotLoader size={20} color="white" /> : "Update Balances"}
              </button>
            </div>
          </div>

          {/* RIGHT PANEL - Wallets Table */}
          <div className="flex-1 min-w-[320px] max-h-[730px] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-semibold text-lg">Wallets ({wallets.length})</h3>
              <button
                onClick={loadWallets}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Refresh
              </button>
            </div>
            <div className="rounded-2xl border border-white/30 bg-transparent h-full flex flex-col overflow-hidden">
              <div className="sticky top-0 z-10 bg-transparent backdrop-blur-[10px]">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <thead>
                    <tr className="bg-[#ffffff0c]">
                      <th className="py-2 px-4 text-left">User</th>
                      <th className="py-2 px-2 text-center">Wallet Address</th>
                      <th className="py-2 px-4 text-center">Balance</th>
                      <th className="py-2 px-4 text-center">Unclaimed Rewards</th>
                      <th className="py-2 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <tbody>
                    {wallets.length > 0 ? wallets.map((wallet, i) => (
                      <tr key={wallet.id} className="bg-[#ffffff0c] rounded-md">
                        <td className="px-4 text-left">
                          <div className="flex items-center gap-2">
                            <Avatar size="small" src={avatarIcon} />
                            <span>{`User ${i + 1}`}</span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <span className="font-mono text-xs">
                            {`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <span className={`font-semibold ${Number(wallet.balance) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                            {Number(wallet.balance || 0).toFixed(4)} SOL
                          </span>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <span className={`font-semibold ${Number(wallet.unclaimedRewards) > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {Number(wallet.unclaimedRewards || 0).toFixed(4)} SOL
                          </span>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleClaimWalletRewards(wallet.id)}
                              disabled={loading || wallet.unclaimedRewards <= 0}
                              className="px-2 py-1 text-xs bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-500 disabled:cursor-not-allowed rounded text-white font-semibold transition-all duration-200"
                              title="Claim Rewards"
                            >
                              <BiCoin className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleCollectFromWallet(wallet.id)}
                              disabled={loading || wallet.balance <= 0.001}
                              className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed rounded text-white font-semibold"
                              title="Collect Funds"
                            >
                              <FiRefreshCw className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleRemoveWallet(wallet.id)}
                              disabled={loading}
                              className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed rounded text-white font-semibold"
                              title="Remove Wallet"
                            >
                              <FaTrash className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-400">
                          No wallets generated yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-xl font-bold">Claimable Rewards</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={loadClaimableSummary}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <FiRefreshCw className="w-4 h-4" />
              Refresh
            </button>
            {claimableSummary.totalWalletsWithRewards > 0 && (
              <button
                onClick={handleAutoClaimAll}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-full text-sm font-semibold transition-all duration-200"
              >
                {loading ? <DotLoader size={16} color="white" /> : `Claim All (${claimableSummary.totalClaimableAmount.toFixed(4)} SOL)`}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a]">
          {/* Summary Cards */}
          <div className="glass-card p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-green-400">
              <NumberFlow
                value={claimableSummary.totalWalletsWithRewards}
                className="text-green-400"
              />
            </div>
            <div className="text-sm text-gray-300 mt-1">Wallets with Rewards</div>
          </div>

          <div className="glass-card p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-yellow-400">
              <NumberFlow
                value={claimableSummary.totalClaimableAmount}
                format={{
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4
                }}
                className="text-yellow-400"
              />
            </div>
            <div className="text-sm text-gray-300 mt-1">Total SOL Claimable</div>
          </div>

          <div className="glass-card p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-blue-400">
              <NumberFlow
                value={claimableSummary.totalClaimableRounds}
                className="text-blue-400"
              />
            </div>
            <div className="text-sm text-gray-300 mt-1">Claimable Rounds</div>
          </div>

          <div className="glass-card p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-purple-400">
              <NumberFlow
                value={claimableSummary.totalClaimableRounds > 0 ? (claimableSummary.totalClaimableAmount / claimableSummary.totalClaimableRounds) : 0}
                format={{
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4
                }}
                className="text-purple-400"
              />
            </div>
            <div className="text-sm text-gray-300 mt-1">Avg SOL per Round</div>
          </div>
        </div>

        {/* Detailed Claimable Rewards Table */}
        {claimableSummary.walletSummaries.length > 0 && (
          <div className="p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a]">
            <h3 className="text-white font-semibold text-lg mb-4">Detailed Claimable Rewards</h3>
            <div className="rounded-2xl border border-white/30 bg-transparent max-h-[400px] overflow-hidden">
              <div className="sticky top-0 z-10 bg-transparent backdrop-blur-[10px]">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <thead>
                    <tr className="bg-[#ffffff0c]">
                      <th className="py-3 px-4 text-left">Wallet</th>
                      <th className="py-3 px-4 text-center">Address</th>
                      <th className="py-3 px-4 text-center">Claimable Rounds</th>
                      <th className="py-3 px-4 text-center">Estimated Rewards</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="overflow-y-auto max-h-[300px]">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <tbody>
                    {claimableSummary.walletSummaries.map((walletSummary, index) => (
                      <tr key={walletSummary.walletId} className="bg-[#ffffff0c] rounded-md">
                        <td className="py-3 px-4 text-left">
                          <div className="flex items-center gap-2">
                            <Avatar size="small" src={avatarIcon} />
                            <span>{`Wallet ${index + 1}`}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-xs">
                            {`${walletSummary.walletAddress.slice(0, 6)}...${walletSummary.walletAddress.slice(-4)}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-semibold">
                            {walletSummary.claimableRounds}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-semibold text-green-400">
                            {walletSummary.estimatedRewards.toFixed(6)} SOL
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleClaimWalletRewards(walletSummary.walletId)}
                            disabled={loading}
                            className="px-3 py-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-full text-xs font-semibold transition-all duration-200"
                          >
                            {loading ? <DotLoader size={12} color="white" /> : "Claim"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Claimable Rewards Message */}
        {claimableSummary.totalWalletsWithRewards === 0 && (
          <div className="p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a] text-center">
            <div className="text-gray-400 text-lg mb-2">🎉 No pending rewards to claim</div>
            <div className="text-gray-500 text-sm">All available rewards have been claimed or no winning bets found.</div>
          </div>
        )}
      </section>

      {/* BOT SECTION with Live Round Card */}
      <section className="space-y-9">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-xl font-bold">BOT</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Current Status:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.status === 'running' ? 'bg-green-500/20 text-green-300' :
              config.status === 'paused' ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-red-500/20 text-red-300'
              }`}>
              {config.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex justify-center items-center">
          <div className="flex flex-col space-y-5 p-[10px] rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a] w-full max-w-[500px] items-center gap-4">
            {/* Header with Triangle Icon and Live Round Text */}
            <div className="flex-col items-center justify-between space-y-3 w-[60%]">
              <div className="flex flex-row">
                <div className="flex items-center gap-2 w-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <path fill="white" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 4v16m14-8L6 20m14-8L6 4" />
                  </svg>
                  <span className="text-white text-lg font-semibold">Live Round</span>
                </div>
                <span className="text-white text-base font-semibold justify-end">#3619</span>
              </div>

              {/* Dynamic Time Progress Bar */}
              <div className="mt-1 w-full h-[6px] rounded-full overflow-hidden flex gap-[4px]">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className="h-full flex-1 rounded-[1px]"
                    style={{
                      backgroundColor:
                        i < Math.floor(((120 - timeLeft) / 120) * 7)
                          ? '#E5E7EB'
                          : '#6B7280'
                    }}
                  />
                ))}
              </div>

              {/* UP Card */}
              <button
                className="w-full rounded-xl text-white font-semibold text-lg flex flex-col items-center py-4"
                style={{
                  background: "linear-gradient(90deg, #06C729 0%, #04801B 100%)"
                }}
              >
                <span>UP</span>
                <span className="text-sm font-medium mt-1">2.51x payout</span>
              </button>

              {/* Price Details Box */}
              <div className="glass-card w-full p-4 rounded-xl border border-white/30 space-y-3 text-white text-sm">
                <div className="flex justify-between items-center">
                  <span className="opacity-70">Live Price</span>
                  <NumberFlow
                    value={livePrice}
                    format={{
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    }}
                    className="font-bold text-base text-green-400"
                    transformTiming={{
                      duration: 800,
                      easing: "ease-out",
                    }}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-semibold">Locked Price</span>
                  <span className="font-semibold">${currentRound?.lockPrice || 250}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-bold">Prize Pool</span>
                  <span className="font-semibold">{currentRound?.totalAmount || 100} SOL</span>
                </div>
              </div>

              {/* DOWN Card */}
              <button
                className="w-full rounded-xl text-white font-semibold text-lg flex flex-col items-center py-4"
                style={{
                  background: "linear-gradient(90deg, #FD6152 0%, #AE1C0F 100%)"
                }}
              >
                <span>DOWN</span>
                <span className="text-sm font-medium mt-1">2.51x payout</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a]">
          {/* LEFT PANEL - Bot Configuration */}
          <div className="flex-1 flex flex-col gap-8 min-w-[300px]">
            <div className="space-y-6">
              {[
                { label: "Bet Time", fromKey: "betTimeFrom", toKey: "betTimeTo", unit: "seconds" },
                { label: "UpDown Balance", fromKey: "upDownBalanceFrom", toKey: "upDownBalanceTo", unit: "ratio" },
                { label: "Wallet Count", fromKey: "walletCountFrom", toKey: "walletCountTo", unit: "count" },
                { label: "Bet Amount", fromKey: "minBet", toKey: "maxBet", unit: "SOL" }, // Changed from minBetAmount/maxBetAmount
                { label: "Working Epoch", fromKey: "epochFrom", toKey: "epochTo", unit: "epoch" },
              ].map(({ label, fromKey, toKey, unit }) => (
                <div key={label} className="flex flex-col gap-2">
                  <label className="text-white font-semibold mb-3">{label}</label>
                  <div className="flex flex-row gap-4">
                    {/* From Field */}
                    <div className="flex-1 flex flex-col">
                      <span className="text-white font-bold text-sm mb-3">From</span>
                      <div className="relative">
                        <input
                          type="number"
                          step={unit === "SOL" ? "0.001" : "1"}
                          placeholder="Enter value"
                          value={String(config[fromKey as keyof BotConfig] || "")}
                          onChange={handleConfigChange(fromKey as keyof BotConfig)}
                          className="w-full glass-card text-white placeholder-white placeholder:font-semibold rounded-full py-3 px-4 pr-10 focus:outline-none"
                        />
                        {unit === "SOL" && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-white">
                            <img src={solIcon} alt="SOL" className="w-4 h-4" />
                            <span className="text-sm font-semibold">SOL</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* To Field */}
                    <div className="flex-1 flex flex-col">
                      <span className="text-white font-bold text-sm mb-3">To</span>
                      <div className="relative">
                        <input
                          type="number"
                          step={unit === "SOL" ? "0.001" : "1"}
                          placeholder="Enter value"
                          value={String(config[toKey as keyof BotConfig] || "")}
                          onChange={handleConfigChange(toKey as keyof BotConfig)}
                          className="w-full glass-card text-white placeholder-white placeholder:font-semibold rounded-full py-3 px-4 pr-10 focus:outline-none"
                        />
                        {unit === "SOL" && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-white">
                            <img src={solIcon} alt="SOL" className="w-4 h-4" />
                            <span className="text-sm font-semibold">SOL</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bot Control Buttons */}
            <div className="flex flex-col gap-4 pt-2 w-full">
              <button
                onClick={handleSetConfig}
                disabled={loading}
                className="yellow-card py-3 rounded-full text-center flex items-center justify-center"
              >
                {loading ? <DotLoader size={20} color="white" /> : "Set Configuration"}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => handleStatusChange("running")}
                  disabled={loading || config.status === "running"}
                  className={`flex-1 py-3 rounded-full text-center font-semibold flex items-center justify-center ${config.status === "running"
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
                    }`}
                >
                  {loading ? <DotLoader size={20} color="white" /> : "Start"}
                </button>

                <button
                  onClick={() => handleStatusChange("paused")}
                  disabled={loading || config.status !== "running"}
                  className={`flex-1 py-3 rounded-full text-center font-semibold flex items-center justify-center ${config.status !== "running"
                    ? "bg-yellow-500 cursor-not-allowed"
                    : "bg-yellow-500 hover:bg-yellow-600"
                    }`}
                >
                  {loading ? <DotLoader size={20} color="white" /> : "Pause"}
                </button>

                <button
                  onClick={() => handleStatusChange("stopped")}
                  disabled={loading || config.status === "stopped"}
                  className={`flex-1 py-3 rounded-full text-center font-semibold flex items-center justify-center ${config.status === "stopped"
                    ? "bg-red-500 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600"
                    }`}
                >
                  {loading ? <DotLoader size={20} color="white" /> : "Stop"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - Active Bets */}
          <div className="flex-1 min-w-[320px] max-h-[1200px] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-semibold text-lg">Active Bets</h3>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${config.status === 'running' ? 'bg-green-400 animate-pulse' :
                  config.status === 'paused' ? 'bg-yellow-400' :
                    'bg-red-400'
                  }`}></div>
                <span className="text-sm text-gray-400">
                  {config.status === 'running' ? 'Bot Active' :
                    config.status === 'paused' ? 'Bot Paused' :
                      'Bot Stopped'}
                </span>
                {botStatus?.claimableRewards?.totalClaimableAmount > 0 && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span className="text-xs text-yellow-400">
                      {botStatus.claimableRewards.totalClaimableAmount.toFixed(4)} SOL claimable
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/30 bg-transparent h-full flex flex-col overflow-hidden">
              <div className="sticky top-0 z-10 bg-transparent backdrop-blur-[10px]">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <thead>
                    <tr className="bg-[#ffffff0c]">
                      <th className="py-2 px-6 text-center">Wallet Address</th>
                      <th className="py-2 text-left">Bet Direction</th>
                      <th className="py-2 px-4 text-center">Amount</th>
                      <th className="py-2 px-4 text-center">Status</th>
                      <th className="py-2 px-4 text-center">Epoch</th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-white text-sm table-auto border-separate border-spacing-y-2">
                  <tbody>
                    {betHistory.length > 0 ? betHistory.map((bet, i) => (
                      <tr key={bet.id || i} className="bg-[#ffffff0c] rounded-md">
                        <td className="px-2 py-2 text-center font-mono text-xs">
                          {`${bet.walletAddress.slice(0, 6)}...${bet.walletAddress.slice(-4)}`}
                        </td>
                        <td className="py-2 text-left">
                          <span className={`px-2 py-1 rounded-full text-sm font-semibold ${bet.direction === "up"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                            }`}>
                            {bet.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {bet.amount} SOL
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${bet.status === "pending"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : bet.status === "won"
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                            }`}>
                            {bet.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {bet.epoch}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-400">
                          No active bets yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}