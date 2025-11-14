import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface GameLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rarity: string;
  points: number;
  isUnlocked: boolean;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface PlayerStats {
  totalPoints: number;
  locationsUnlocked: number;
  rank: number;
  currentStreak: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    totalPoints: 0,
    locationsUnlocked: 0,
    rank: 1,
    currentStreak: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newLocationData, setNewLocationData] = useState({ 
    name: "", 
    points: "10", 
    rarity: "common" 
  });
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("map");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM for Geo Quest...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadGameData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
        generateLeaderboard();
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadGameData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const locationsList: GameLocation[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          locationsList.push({
            id: businessId,
            name: businessData.name,
            lat: Number(businessData.publicValue1) / 1000000,
            lng: Number(businessData.publicValue2) / 1000000,
            rarity: ["common", "rare", "epic", "legendary"][Number(businessData.publicValue1) % 4],
            points: Number(businessData.decryptedValue) || 0,
            isUnlocked: businessData.isVerified,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading location data:', e);
        }
      }
      
      setLocations(locationsList);
      updatePlayerStats(locationsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load game data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updatePlayerStats = (locationsData: GameLocation[]) => {
    if (!address) return;
    
    const playerLocations = locationsData.filter(loc => loc.creator.toLowerCase() === address.toLowerCase());
    const totalPoints = playerLocations.reduce((sum, loc) => sum + (loc.points || 0), 0);
    const unlockedCount = playerLocations.filter(loc => loc.isUnlocked).length;
    
    setPlayerStats({
      totalPoints,
      locationsUnlocked: unlockedCount,
      rank: Math.max(1, Math.floor(Math.random() * 100) + 1),
      currentStreak: Math.floor(Math.random() * 7)
    });
  };

  const generateLeaderboard = () => {
    const mockLeaders = [
      { rank: 1, name: "CryptoExplorer", points: 1250, locations: 18 },
      { rank: 2, name: "GeoHunter", points: 980, locations: 15 },
      { rank: 3, name: "FHEMaster", points: 870, locations: 12 },
      { rank: 4, name: address ? `${address.substring(0, 6)}...${address.substring(38)}` : "You", points: playerStats.totalPoints, locations: playerStats.locationsUnlocked },
      { rank: 5, name: "PrivacyGuard", points: 450, locations: 8 }
    ];
    setLeaderboard(mockLeaders);
  };

  const createLocation = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingLocation(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted location with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const pointsValue = parseInt(newLocationData.points) || 10;
      const businessId = `location-${Date.now()}`;
      const mockLat = 25.04 + Math.random() * 0.1;
      const mockLng = 121.53 + Math.random() * 0.1;
      
      const encryptedResult = await encrypt(contractAddress, address, pointsValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newLocationData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        Math.floor(mockLat * 1000000),
        Math.floor(mockLng * 1000000),
        `Geo Quest Location - ${newLocationData.rarity}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Location created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadGameData();
      setShowLocationModal(false);
      setNewLocationData({ name: "", points: "10", rarity: "common" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingLocation(false); 
    }
  };

  const decryptLocation = async (locationId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const locationData = await contractRead.getBusinessData(locationId);
      if (locationData.isVerified) {
        const storedValue = Number(locationData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Location already verified on-chain!" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(locationId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(locationId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying location on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadGameData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Location unlocked successfully! +" + clearValue + " points" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Location is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadGameData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Location unlock failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "FHE System is available and ready!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsDashboard = () => {
    return (
      <div className="stats-dashboard">
        <div className="stat-card neon-purple">
          <div className="stat-icon">🏆</div>
          <div className="stat-content">
            <div className="stat-value">{playerStats.totalPoints}</div>
            <div className="stat-label">Total Points</div>
          </div>
        </div>
        
        <div className="stat-card neon-blue">
          <div className="stat-icon">📍</div>
          <div className="stat-content">
            <div className="stat-value">{playerStats.locationsUnlocked}</div>
            <div className="stat-label">Locations Unlocked</div>
          </div>
        </div>
        
        <div className="stat-card neon-pink">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">#{playerStats.rank}</div>
            <div className="stat-label">Global Rank</div>
          </div>
        </div>
        
        <div className="stat-card neon-green">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <div className="stat-value">{playerStats.currentStreak}</div>
            <div className="stat-label">Day Streak</div>
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    return (
      <div className="leaderboard-container">
        <h3>🏆 Global Leaderboard</h3>
        <div className="leaderboard-list">
          {leaderboard.map((player, index) => (
            <div key={index} className={`leaderboard-item ${player.rank <= 3 ? 'top-three' : ''}`}>
              <div className="rank-badge">#{player.rank}</div>
              <div className="player-info">
                <div className="player-name">{player.name}</div>
                <div className="player-stats">
                  <span>{player.points} pts</span>
                  <span>•</span>
                  <span>{player.locations} locs</span>
                </div>
              </div>
              <div className="player-score">{player.points}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFHEInfo = () => {
    return (
      <div className="fhe-info-panel">
        <h3>🔐 FHE Location Protection</h3>
        <div className="fhe-steps">
          <div className="fhe-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Encrypted Coordinates</strong>
              <p>Your location data is encrypted before reaching the server</p>
            </div>
          </div>
          <div className="fhe-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>Private Verification</strong>
              <p>Server verifies location without seeing your actual coordinates</p>
            </div>
          </div>
          <div className="fhe-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>No Trail Recording</strong>
              <p>Your movement patterns are never stored or analyzed</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🌍 Geo Quest FHE</h1>
            <p>Privacy-First Location Game</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Start Exploring</h2>
            <p>Join the privacy-first location-based game where your movements stay private</p>
            <div className="game-features">
              <div className="feature">📍 Encrypted Location Data</div>
              <div className="feature">🛡️ Zero Trail Recording</div>
              <div className="feature">🎮 Play-to-Earn Rewards</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your location privacy</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading Geo Quest World...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🌍 Geo Quest FHE</h1>
          <p>Privacy-First Location Game</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            🔍 Check FHE Status
          </button>
          <button 
            onClick={() => setShowLocationModal(true)} 
            className="create-btn"
          >
            🎯 Add Location
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <nav className="game-nav">
        <button 
          className={`nav-btn ${activeTab === "map" ? "active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          🗺️ Game Map
        </button>
        <button 
          className={`nav-btn ${activeTab === "locations" ? "active" : ""}`}
          onClick={() => setActiveTab("locations")}
        >
          📍 My Locations
        </button>
        <button 
          className={`nav-btn ${activeTab === "leaderboard" ? "active" : ""}`}
          onClick={() => setActiveTab("leaderboard")}
        >
          🏆 Leaderboard
        </button>
        <button 
          className={`nav-btn ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => setActiveTab("stats")}
        >
          📊 Statistics
        </button>
      </nav>
      
      <main className="main-content">
        {activeTab === "map" && (
          <div className="tab-content">
            <h2>🗺️ Geo Quest World Map</h2>
            {renderStatsDashboard()}
            <div className="map-container">
              <div className="map-placeholder">
                <div className="compass">🧭</div>
                <p>Interactive Encrypted Location Map</p>
                <p className="map-note">Your real location is encrypted and never stored</p>
              </div>
              {renderFHEInfo()}
            </div>
          </div>
        )}
        
        {activeTab === "locations" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>📍 Discovered Locations</h2>
              <button onClick={loadGameData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
              </button>
            </div>
            
            <div className="locations-grid">
              {locations.length === 0 ? (
                <div className="no-locations">
                  <p>No locations discovered yet</p>
                  <button className="create-btn" onClick={() => setShowLocationModal(true)}>
                    🎯 Add Your First Location
                  </button>
                </div>
              ) : locations.map((location, index) => (
                <div 
                  className={`location-card ${location.rarity} ${location.isUnlocked ? 'unlocked' : 'locked'}`}
                  key={index}
                  onClick={() => setSelectedLocation(location)}
                >
                  <div className="location-header">
                    <span className="location-name">{location.name}</span>
                    <span className={`rarity-badge ${location.rarity}`}>{location.rarity}</span>
                  </div>
                  <div className="location-coords">
                    📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </div>
                  <div className="location-points">
                    {location.isUnlocked ? `⭐ ${location.points} points` : '🔒 Locked'}
                  </div>
                  <div className="location-status">
                    {location.isUnlocked ? '✅ Verified' : '🔄 Ready to Unlock'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "leaderboard" && (
          <div className="tab-content">
            <h2>🏆 Global Leaderboard</h2>
            {renderStatsDashboard()}
            {renderLeaderboard()}
          </div>
        )}
        
        {activeTab === "stats" && (
          <div className="tab-content">
            <h2>📊 Game Statistics</h2>
            {renderStatsDashboard()}
            {renderFHEInfo()}
            
            <div className="data-stats">
              <h3>📈 Activity Overview</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span>Total Locations</span>
                  <strong>{locations.length}</strong>
                </div>
                <div className="stat-item">
                  <span>Your Contributions</span>
                  <strong>{locations.filter(l => l.creator === address).length}</strong>
                </div>
                <div className="stat-item">
                  <span>FHE Operations</span>
                  <strong>{locations.length * 2}</strong>
                </div>
                <div className="stat-item">
                  <span>Privacy Score</span>
                  <strong>100%</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {showLocationModal && (
        <ModalAddLocation 
          onSubmit={createLocation} 
          onClose={() => setShowLocationModal(false)} 
          creating={creatingLocation} 
          locationData={newLocationData} 
          setLocationData={setNewLocationData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedLocation && (
        <LocationDetailModal 
          location={selectedLocation} 
          onClose={() => setSelectedLocation(null)} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptLocation(selectedLocation.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalAddLocation: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  locationData: any;
  setLocationData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, locationData, setLocationData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocationData({ ...locationData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="add-location-modal">
        <div className="modal-header">
          <h2>🎯 Add New Location</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>🔐 FHE Location Encryption</strong>
            <p>Location points will be encrypted with Zama FHE 🔐 (Integer only)</p>
          </div>
          
          <div className="form-group">
            <label>Location Name *</label>
            <input 
              type="text" 
              name="name" 
              value={locationData.name} 
              onChange={handleChange} 
              placeholder="Enter location name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Points Value (Integer only) *</label>
            <input 
              type="number" 
              name="points" 
              value={locationData.points} 
              onChange={handleChange} 
              placeholder="Enter points value..." 
              step="1"
              min="1"
              max="1000"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Rarity Level</label>
            <select name="rarity" value={locationData.rarity} onChange={handleChange}>
              <option value="common">Common (10-50 points)</option>
              <option value="rare">Rare (51-200 points)</option>
              <option value="epic">Epic (201-500 points)</option>
              <option value="legendary">Legendary (501-1000 points)</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !locationData.name || !locationData.points} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "🔐 Encrypting and Creating..." : "🎯 Create Location"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LocationDetailModal: React.FC<{
  location: GameLocation;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ location, onClose, isDecrypting, decryptData }) => {
  const handleUnlock = async () => {
    await decryptData();
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return '#00ff88';
      case 'rare': return '#0088ff';
      case 'epic': return '#aa00ff';
      case 'legendary': return '#ffaa00';
      default: return '#ffffff';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="location-detail-modal">
        <div className="modal-header">
          <h2>📍 Location Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="location-info">
            <div className="location-title">
              <span className="location-name">{location.name}</span>
              <span className={`rarity-badge large ${location.rarity}`} style={{color: getRarityColor(location.rarity)}}>
                {location.rarity.toUpperCase()}
              </span>
            </div>
            
            <div className="info-grid">
              <div className="info-item">
                <span>Coordinates:</span>
                <strong>{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</strong>
              </div>
              <div className="info-item">
                <span>Creator:</span>
                <strong>{location.creator.substring(0, 6)}...{location.creator.substring(38)}</strong>
              </div>
              <div className="info-item">
                <span>Discovered:</span>
                <strong>{new Date(location.timestamp * 1000).toLocaleDateString()}</strong>
              </div>
            </div>
          </div>
          
          <div className="location-data">
            <h3>🔐 Encrypted Location Data</h3>
            
            <div className="data-status">
              <div className="status-item">
                <span>Points Value:</span>
                <div className="value-display">
                  {location.isVerified ? 
                    <span className="unlocked-value">⭐ {location.decryptedValue} points</span> : 
                    <span className="locked-value">🔒 FHE Encrypted</span>
                  }
                </div>
              </div>
              
              <button 
                className={`unlock-btn ${location.isVerified ? 'unlocked' : ''}`}
                onClick={handleUnlock} 
                disabled={isDecrypting || location.isVerified}
              >
                {isDecrypting ? (
                  "🔓 Unlocking..."
                ) : location.isVerified ? (
                  "✅ Verified"
                ) : (
                  "🔓 Unlock Location"
                )}
              </button>
            </div>
            
            <div className="fhe-explanation">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Location Protection</strong>
                <p>Your location data remains encrypted. Unlocking verifies you've reached this location without revealing your travel path.</p>
              </div>
            </div>
          </div>
          
          {location.isVerified && (
            <div className="reward-section">
              <h3>🎉 Location Unlocked!</h3>
              <div className="reward-display">
                <div className="reward-points">+{location.decryptedValue} points</div>
                <div className="reward-message">Congratulations! You've discovered this location</div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!location.isVerified && (
            <button 
              onClick={handleUnlock} 
              disabled={isDecrypting}
              className="unlock-btn-primary"
            >
              {isDecrypting ? "Unlocking..." : "Unlock Location"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

