// src/Admin.js - Admin Dashboard
import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, get, update, remove } from 'firebase/database';
import './Admin.css';

// Simple authentication (replace with proper auth in production)
const ADMIN_PASSWORD = "admin123";  // CHANGE THIS!

function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Dashboard data
  const [stats, setStats] = useState({
    totalSales: 0,
    todaySales: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    lowStock: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [machines, setMachines] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);

  // ============ AUTHENTICATION ============
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadDashboardData();
    } else {
      alert('Invalid password!');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
  };

  // ============ DATA LOADING ============
  const loadDashboardData = async () => {
    await Promise.all([
      loadTransactions(),
      loadInventory(),
      loadMachines(),
      loadActiveSessions()
    ]);
  };

  const loadTransactions = async () => {
    try {
      const transactionsRef = ref(database, 'transactions');
      const snapshot = await get(transactionsRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const transactionList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => b.timestamp - a.timestamp);
        
        setTransactions(transactionList);
        calculateStats(transactionList);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const loadInventory = async () => {
    try {
      const inventoryRef = ref(database, 'machines/VEND001/inventory');
      const snapshot = await get(inventoryRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const inventoryList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setInventory(inventoryList);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };

  const loadMachines = async () => {
    try {
      const machinesRef = ref(database, 'machines');
      const snapshot = await get(machinesRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const machineList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setMachines(machineList);
      }
    } catch (error) {
      console.error('Error loading machines:', error);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const sessionsRef = ref(database, 'sessions');
      const snapshot = await get(sessionsRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const now = Math.floor(Date.now() / 1000);
        const activeSessions = Object.keys(data)
          .map(key => ({ code: key, ...data[key] }))
          .filter(session => session.status === 'active' && session.expiresAt > now);
        setActiveSessions(activeSessions);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const calculateStats = (transactionList) => {
    const today = new Date().setHours(0, 0, 0, 0);
    
    let totalSales = transactionList.length;
    let totalRevenue = 0;
    let todaySales = 0;
    let todayRevenue = 0;
    
    transactionList.forEach(txn => {
      totalRevenue += txn.totalAmount || 0;
      
      const txnDate = new Date(txn.timestamp).setHours(0, 0, 0, 0);
      if (txnDate === today) {
        todaySales++;
        todayRevenue += txn.totalAmount || 0;
      }
    });
    
    const lowStock = inventory.filter(item => item.stock < 5).length;
    
    setStats({
      totalSales,
      todaySales,
      totalRevenue,
      todayRevenue,
      lowStock
    });
  };

  // ============ INVENTORY MANAGEMENT ============
  const updateStock = async (productId, newStock) => {
    try {
      const productRef = ref(database, `machines/VEND001/inventory/${productId}`);
      await update(productRef, { stock: parseInt(newStock) });
      alert('Stock updated successfully!');
      loadInventory();
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Failed to update stock');
    }
  };

  const updatePrice = async (productId, newPrice) => {
    try {
      const productRef = ref(database, `machines/VEND001/inventory/${productId}`);
      await update(productRef, { price: parseInt(newPrice) });
      alert('Price updated successfully!');
      loadInventory();
    } catch (error) {
      console.error('Error updating price:', error);
      alert('Failed to update price');
    }
  };

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        loadDashboardData();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // ============ LOGIN SCREEN ============
  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="login-container">
          <h1>🔐 Admin Login</h1>
          <p className="login-subtitle">Vending Machine Management</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="login-input"
              autoFocus
            />
            <button type="submit" className="login-btn">
              Login →
            </button>
          </form>
          <p className="login-note">Default password: admin123</p>
        </div>
      </div>
    );
  }

  // ============ DASHBOARD SCREENS ============
  
  const DashboardTab = () => (
    <div className="tab-content">
      <h2>Dashboard Overview</h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <h3>Today's Sales</h3>
            <p className="stat-value">{stats.todaySales}</p>
            <p className="stat-label">transactions</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <h3>Today's Revenue</h3>
            <p className="stat-value">₹{stats.todayRevenue}</p>
            <p className="stat-label">collected</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-info">
            <h3>Total Sales</h3>
            <p className="stat-value">{stats.totalSales}</p>
            <p className="stat-label">all time</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-info">
            <h3>Low Stock Items</h3>
            <p className="stat-value">{stats.lowStock}</p>
            <p className="stat-label">need restock</p>
          </div>
        </div>
      </div>

      <div className="dashboard-sections">
        <div className="section">
          <h3>Recent Transactions</h3>
          <div className="transactions-list">
            {transactions.slice(0, 5).map(txn => (
              <div key={txn.id} className="transaction-item">
                <div className="txn-info">
                  <strong>{txn.transactionId?.slice(0, 15)}...</strong>
                  <span>{txn.date}</span>
                </div>
                <div className="txn-amount">₹{txn.totalAmount}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Active Sessions</h3>
          {activeSessions.length > 0 ? (
            <div className="sessions-list">
              {activeSessions.map(session => (
                <div key={session.code} className="session-item">
                  <strong>{session.code}</strong>
                  <span>Expires: {new Date(session.expiresAt * 1000).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No active sessions</p>
          )}
        </div>
      </div>
    </div>
  );

  const generateTestCode = async () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTime = currentTime + 300; // 5 minutes
  
  try {
    await update(ref(database, `sessions/${code}`), {
      code: code,
      machineId: 'VEND001',
      status: 'active',
      createdAt: currentTime,
      expiresAt: expiryTime
    });
    
    alert(`Test Code Generated: ${code}\n\nValid for 5 minutes.`);
  } catch (error) {
    console.error('Error generating test code:', error);
    alert('Failed to generate test code');
  }
};

// Add this button to DashboardTab component
<button onClick={generateTestCode} className="action-btn">
  🧪 Generate Test Code
</button>





  const InventoryTab = () => (
    <div className="tab-content">
      <h2>Inventory Management</h2>
      <button onClick={loadInventory} className="refresh-btn">🔄 Refresh</button>
      
      <table className="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {inventory.map(product => (
            <tr key={product.id}>
              <td>
                <div className="product-cell">
                  <span className="product-emoji">{product.image}</span>
                  <strong>{product.name}</strong>
                </div>
              </td>
              <td>
                <input
                  type="number"
                  defaultValue={product.price}
                  onBlur={(e) => {
                    if (e.target.value !== product.price.toString()) {
                      updatePrice(product.id, e.target.value);
                    }
                  }}
                  className="inline-input"
                  style={{width: '80px'}}
                />
              </td>
              <td>
                <input
                  type="number"
                  defaultValue={product.stock}
                  onBlur={(e) => {
                    if (e.target.value !== product.stock.toString()) {
                      updateStock(product.id, e.target.value);
                    }
                  }}
                  className="inline-input"
                  style={{width: '80px'}}
                />
              </td>
              <td>
                <span className={`status-badge ${product.stock < 5 ? 'low' : 'ok'}`}>
                  {product.stock < 5 ? 'Low Stock' : 'In Stock'}
                </span>
              </td>
              <td>
                <button 
                  onClick={() => updateStock(product.id, product.stock + 10)}
                  className="action-btn"
                >
                  +10 Stock
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const TransactionsTab = () => (
    <div className="tab-content">
      <h2>All Transactions</h2>
      <button onClick={loadTransactions} className="refresh-btn">🔄 Refresh</button>
      
      <table className="admin-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Date & Time</th>
            <th>Items</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(txn => (
            <tr key={txn.id}>
              <td><code>{txn.transactionId?.slice(0, 20)}...</code></td>
              <td>{txn.date}</td>
              <td>
                {txn.items?.map(item => `${item.name} x${item.quantity}`).join(', ')}
              </td>
              <td><strong>₹{txn.totalAmount}</strong></td>
              <td>
                <span className="status-badge ok">{txn.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const MachinesTab = () => (
    <div className="tab-content">
      <h2>Machine Status</h2>
      <button onClick={loadMachines} className="refresh-btn">🔄 Refresh</button>
      
      {machines.map(machine => (
        <div key={machine.id} className="machine-card">
          <div className="machine-header">
            <h3>🏪 {machine.id}</h3>
            <span className={`status-badge ${machine.status === 'online' ? 'ok' : 'low'}`}>
              {machine.status}
            </span>
          </div>
          <div className="machine-details">
            <p><strong>Location:</strong> {machine.location || 'N/A'}</p>
            <p><strong>Last Online:</strong> {new Date(machine.lastOnline * 1000).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );

  // ============ MAIN ADMIN UI ============
  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>🏪 Vending Machine Admin</h1>
        <button onClick={handleLogout} className="logout-btn">
          Logout →
        </button>
      </div>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={activeTab === 'inventory' ? 'active' : ''}
          onClick={() => setActiveTab('inventory')}
        >
          📦 Inventory
        </button>
        <button 
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          💳 Transactions
        </button>
        <button 
          className={activeTab === 'machines' ? 'active' : ''}
          onClick={() => setActiveTab('machines')}
        >
          🤖 Machines
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'transactions' && <TransactionsTab />}
        {activeTab === 'machines' && <MachinesTab />}
      </div>
    </div>
  );
}

export default Admin;
