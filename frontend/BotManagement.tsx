import { useState, useEffect, useRef } from "react";
import { FaPause, FaStop } from "react-icons/fa6";
import { message, Avatar } from "antd";
import { RiRestartLine } from "react-icons/ri";
import { HiMiniPlayPause } from "react-icons/hi2";
import axios from "axios";
import avatarIcon from "../../assets/Avatar.png";
import NumberFlow from '@number-flow/react'
import solIcon from "../../../public/sol-icon.png";
import { DotLoader } from "react-spinners";
import { ArrowDown, ArrowUp } from "lucide-react";

interface BotWallet {
  id: number;
  address: string;
  balance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BotConfig {
  id: number;
  walletCount: number;
  minBet: number;
  maxBet: number;
  epochFrom: number;
  epochTo: number;
  betTimeFrom: number;
  betTimeTo: number;
  downBalanceFrom: number;
  downBalanceTo: number;
  upBalanceFrom: number;
  upBalanceTo: number;
  walletCountFrom: number;
  walletCountTo: number;
  minBetFrom: number;
  minBetTo: number;
  maxBetFrom: number;
  maxBetTo: number;
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

interface SolPriceData {
  price: number;
  change24h: number;
  volume24h: number;
}

const API_BASE_URL = "https://sol-prediction-backend-6e3r.onrender.com/bot-management";

export default function BotManagement() {
  const [config, setConfig] = useState<BotConfig>({
    id: 0,
    walletCount: 0,
    minBet: 0,
    maxBet: 0,
    epochFrom: 0,
    epochTo: 0,
    betTimeFrom: 0,
    betTimeTo: 180,
    downBalanceFrom: 1.0,
    downBalanceTo: 2.0,
    upBalanceFrom: 1.0,
    upBalanceTo: 2.0,
    walletCountFrom: 1,
    walletCountTo: 10,
    minBetFrom: 0.01,
    minBetTo: 0.1,
    maxBetFrom: 0.1,
    maxBetTo: 1.0,
    status: "stopped",
    isActive: true,
    createdAt: "",
    updatedAt: ""
  });

  const [wallets, setWallets] = useState<BotWallet[]>([]);
  const [betHistory, setBetHistory] = useState<BetHistory[]>([]);
  const [distributionConfig, setDistributionConfig] = useState({
    totalAmount: "",
    minAmount: "",
    maxAmount: ""
  });
  const [generateWalletCount, setGenerateWalletCount] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);

  // New state for SOL price and betting
  const [solPrice, setSolPrice] = useState<SolPriceData>({
    price: 0,
    change24h: 0,
    volume24h: 0
  });
  const [currentEpoch, setCurrentEpoch] = useState(3619);
  const [activeBets, setActiveBets] = useState<BetHistory[]>([]);
  const [lockedPrice, setLockedPrice] = useState<number>(0);

  // Refs for intervals
  const priceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bettingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const epochIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch real-time SOL price
  const fetchSolPrice = async () => {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true'
      );

      if (response.data && response.data.solana) {
        setSolPrice({
          price: response.data.solana.usd,
          change24h: response.data.solana.usd_24h_change || 0,
          volume24h: response.data.solana.usd_24h_vol || 0
        });
      }
    } catch (error) {
      console.error("Failed to fetch SOL price:", error);
      // Fallback to random price simulation if API fails
      setSolPrice(prev => ({
        ...prev,
        price: prev.price > 0 ? prev.price + (Math.random() - 0.5) * 2 : 250 + Math.random() * 50
      }));
    }
  };

  // Generate random bet for a wallet
  const generateRandomBet = (wallet: BotWallet): Omit<BetHistory, 'id' | 'createdAt'> => {
    const direction = Math.random() > 0.5 ? 'up' : 'down';
    const amount = Number((Math.random() * (config.maxBetTo - config.minBetFrom) + config.minBetFrom).toFixed(4));

    return {
      walletAddress: wallet.address,
      epoch: currentEpoch,
      direction,
      amount,
      status: 'pending',
      betTime: Date.now(),
    };
  };

  // Execute betting logic
  const executeBetting = async () => {
    if (config.status !== 'running' || wallets.length === 0) return;

    // Check if current epoch is within working range
    if (currentEpoch < config.epochFrom || currentEpoch > config.epochTo) {
      console.log(`Current epoch ${currentEpoch} is outside working range ${config.epochFrom}-${config.epochTo}`);
      return;
    }

    try {
      // Select random number of wallets to bet
      const walletCount = Math.floor(
        Math.random() * (config.walletCountTo - config.walletCountFrom + 1) + config.walletCountFrom
      );

      const activeWallets = wallets
        .filter(w => w.balance > config.minBetFrom)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(walletCount, wallets.length));

      if (activeWallets.length === 0) {
        console.log("No wallets with sufficient balance for betting");
        return;
      }

      // Generate bets for selected wallets
      const newBets: BetHistory[] = activeWallets.map((wallet, index) => ({
        id: Date.now() + index,
        ...generateRandomBet(wallet),
        createdAt: new Date().toISOString()
      }));

      // Add random delay between betTimeFrom and betTimeTo
      const betDelay = Math.floor(
        Math.random() * (config.betTimeTo - config.betTimeFrom + 1) + config.betTimeFrom
      ) * 1000;

      setTimeout(() => {
        setActiveBets(prev => [...newBets, ...prev].slice(0, 50)); // Keep last 50 bets
        setBetHistory(prev => [...newBets, ...prev].slice(0, 100)); // Keep last 100 bets

        console.log(`Placed ${newBets.length} bets for epoch ${currentEpoch}`);

        // Simulate bet outcomes after some time
        setTimeout(() => {
          setActiveBets(prev =>
            prev.map(bet => {
              if (newBets.some(nb => nb.id === bet.id)) {
                const outcome = Math.random() > 0.5 ? 'won' : 'lost';
                return { ...bet, status: outcome };
              }
              return bet;
            })
          );
        }, 30000); // Resolve bets after 30 seconds

      }, betDelay);

    } catch (error) {
      console.error("Failed to execute betting:", error);
    }
  };

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // New epoch starts
          setCurrentEpoch(prevEpoch => prevEpoch + 1);
          setLockedPrice(solPrice.price);
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [solPrice.price]);

  // Price fetching effect
  useEffect(() => {
    // Initial fetch
    fetchSolPrice();

    // Set up interval for price updates
    priceIntervalRef.current = setInterval(fetchSolPrice, 3000); // Update every 3 seconds

    return () => {
      if (priceIntervalRef.current) {
        clearInterval(priceIntervalRef.current);
      }
    };
  }, []);

  // Betting execution effect
  useEffect(() => {
    if (config.status === 'running') {
      // Execute betting logic every 10-30 seconds randomly
      const executeBettingWithRandomDelay = () => {
        const delay = Math.random() * 20000 + 10000; // 10-30 seconds
        bettingIntervalRef.current = setTimeout(() => {
          executeBetting();
          executeBettingWithRandomDelay(); // Schedule next execution
        }, delay);
      };

      executeBettingWithRandomDelay();
    }

    return () => {
      if (bettingIntervalRef.current) {
        clearTimeout(bettingIntervalRef.current);
      }
    };
  }, [config.status, wallets, currentEpoch, config]);

  // Load initial data
  useEffect(() => {
    loadConfig();
    loadWallets();
    loadActiveBets();
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

  const loadWallets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/wallets`);
      if (response.data.success) {
        setWallets(
          response.data.data.map((w: any) => ({
            ...w,
            balance: Number(w.balance) || 0,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load wallets:", error);
      message.error("Failed to load wallets");
    }
  };

  const loadActiveBets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/bets/active`);
      if (response.data.success) {
        setActiveBets(response.data.data || []);
      }
    } catch (error) {
      console.error("Failed to load active bets:", error);
      // Don't show error message for this as it's not critical
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
      const response = await axios.post(`${API_BASE_URL}/config`, config);
      if (response.data.success) {
        message.success("Bot configuration updated successfully!");
        setConfig(response.data.data);
      }
    } catch (error) {
      console.error("Failed to update config:", error);
      message.error("Failed to update bot configuration");
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

        if (newStatus === 'running') {
          message.success("Bot is now active and will start betting according to configuration!");
        } else if (newStatus === 'stopped') {
          // Clear active bets when stopped
          setActiveBets([]);
        }
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
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-gray-400">
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
              <div className="flex flex-row justify-between items-center w-full">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <path fill="white" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 4v16m14-8L6 20m14-8L6 4" />
                  </svg>
                  <span className="text-white text-lg font-semibold">Live Round</span>
                </div>
                <span className="text-white text-base font-semibold">#{currentEpoch}</span>
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

              {/* Timer Display */}
              <div className="text-center">
                <span className="text-white text-sm font-medium">
                  Time Left: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </span>
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
                  <div className="flex flex-col items-end">
                    <NumberFlow
                      value={solPrice.price}
                      format={{
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      }}
                      className={`font-bold text-base ${solPrice.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      transformTiming={{
                        duration: 500,
                        easing: "ease-out",
                      }}
                    />
                    {solPrice.change24h !== 0 && (
                      <span className={`text-xs ${solPrice.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {solPrice.change24h >= 0 ? '+' : ''}{solPrice.change24h.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-semibold">Locked Price</span>
                  <span className="font-semibold">
                    ${lockedPrice > 0 ? lockedPrice.toFixed(2) : "N/A"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-bold">Prize Pool</span>
                  <span className="font-semibold">100 SOL</span>
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

        {/* Bot Configuration and Active Bets */}
        <div className="flex flex-col lg:flex-row gap-6 p-6 rounded-2xl border border-white/30 backdrop-blur-[10px] bg-[#ffffff1a]">
          {/* LEFT PANEL - Bot Configuration */}
          <div className="flex-1 flex flex-col gap-8 min-w-[300px]">
            <div className="space-y-6">
              {[
                { label: "Bet Time", fromKey: "betTimeFrom", toKey: "betTimeTo", unit: "seconds" },
                { label: "Down Balance", fromKey: "downBalanceFrom", toKey: "downBalanceTo", unit: "ratio" },
                { label: "Up Balance", fromKey: "upBalanceFrom", toKey: "upBalanceTo", unit: "ratio" },
                { label: "Wallet Count", fromKey: "walletCountFrom", toKey: "walletCountTo", unit: "count" },
                { label: "Min Bet Amount", fromKey: "minBetFrom", toKey: "minBetTo", unit: "SOL" },
                { label: "Max Bet Amount", fromKey: "maxBetFrom", toKey: "maxBetTo", unit: "SOL" },
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
                    {activeBets.length > 0 ? activeBets.map((bet, i) => (
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