// src/Admin.js - WITH BUILT-IN LOGIN
import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, onValue, update } from 'firebase/database';
import './Admin.css';

// Admin credentials
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'  // Change this to your secure password
};

function Admin({ onLogout }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMachine, setSelectedMachine] = useState('VEND001');
  const [machines, setMachines] = useState({});
  const [inventory, setInventory] = useState({});
  const [transactions, setTransactions] = useState([]);

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    // Simulate authentication delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      console.log('✅ Admin login successful');
      setIsAuthenticated(true);
    } else {
      setLoginError('Invalid username or password');
      setPassword('');
    }

    setLoginLoading(false);
  };

  // Load machines
  useEffect(() => {
    if (!isAuthenticated) return;

    const machinesRef = ref(database, 'machines');
    const unsubscribe = onValue(machinesRef, (snapshot) => {
      if (snapshot.exists()) {
        setMachines(snapshot.val());
      }
    });
    return () => unsubscribe();
  }, [isAuthenticated]);

  // Load inventory for selected machine
  useEffect(() => {
    if (!isAuthenticated || !selectedMachine) return;

    const inventoryRef = ref(database, `machines/${selectedMachine}/inventory`);
    const unsubscribe = onValue(inventoryRef, (snapshot) => {
      if (snapshot.exists()) {
        setInventory(snapshot.val());
      } else {
        setInventory({});
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated, selectedMachine]);

  // Load transactions
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'transactions') return;

    const transactionsRef = ref(database, 'transactions');
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.entries(data).map(([id, txn]) => ({ id, ...txn }));
        list.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(list);
      } else {
        setTransactions([]);
      }
    });
    return () => unsubscribe();
  }, [isAuthenticated, activeTab]);

  // Update stock
  const updateStock = async (productId, newStock) => {
    try {
      await update(ref(database, `machines/${selectedMachine}/inventory/${productId}`), {
        stock: Number(newStock)
      });
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Failed to update stock');
    }
  };

  // Update price
  const updatePrice = async (productId, newPrice) => {
    try {
      await update(ref(database, `machines/${selectedMachine}/inventory/${productId}`), {
        price: Number(newPrice)
      });
    } catch (error) {
      console.error('Error updating price:', error);
      alert('Failed to update price');
    }
  };

  // Add stock
  const addStock = async (productId, amount) => {
    const currentStock = inventory[productId]?.stock || 0;
    await updateStock(productId, currentStock + amount);
  };

  // Dashboard Tab
  const DashboardTab = () => {
    const totalProducts = Object.keys(inventory).length;
    const totalStock = Object.values(inventory).reduce((sum, p) => sum + (p.stock || 0), 0);
    const lowStockItems = Object.entries(inventory).filter(([_, p]) => p.stock < 5).length;
    const totalTransactions = transactions.length;
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    return (
      <div>
        <h2>Dashboard</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-info">
              <div className="stat-value">{totalProducts}</div>
              <div className="stat-label">Products</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-info">
              <div className="stat-value">{totalStock}</div>
              <div className="stat-label">Total Stock</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-info">
              <div className="stat-value">{lowStockItems}</div>
              <div className="stat-label">Low Stock</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <div className="stat-value">₹{totalRevenue.toFixed(2)}</div>
              <div className="stat-label">Revenue</div>
            </div>
          </div>
        </div>

        <div style={{marginTop: '30px'}}>
          <h3>Recent Transactions</h3>
          <div className="transactions-list">
            {transactions.slice(0, 5).map(txn => (
              <div key={txn.id} className="transaction-item">
                <div>
                  <strong>{txn.transactionId}</strong>
                  <div style={{fontSize: '12px', color: '#999'}}>{txn.date}</div>
                </div>
                <div style={{textAlign: 'right'}}>
                  <strong>₹{txn.totalAmount?.toFixed(2)}</strong>
                  <div style={{fontSize: '12px', color: '#4caf50'}}>Completed</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Inventory Tab
  const InventoryTab = () => {
    const [editingPrice, setEditingPrice] = useState(null);
    const [editingStock, setEditingStock] = useState(null);

    return (
      <div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
          <h2>Inventory Management</h2>
          <button onClick={() => window.location.reload()} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>

        <div style={{marginBottom: '20px'}}>
          <label>Machine: </label>
          <select 
            value={selectedMachine} 
            onChange={(e) => setSelectedMachine(e.target.value)}
            style={{padding: '8px', borderRadius: '4px', border: '1px solid #ddd'}}
          >
            {Object.keys(machines).map(machineId => (
              <option key={machineId} value={machineId}>{machineId}</option>
            ))}
          </select>
        </div>

        <table className="inventory-table">
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
            {Object.entries(inventory).map(([productId, product]) => (
              <tr key={productId}>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <span style={{fontSize: '24px'}}>{product.image || '📦'}</span>
                    <strong>{product.name || 'Unnamed'}</strong>
                  </div>
                </td>
                <td>
                  {editingPrice === productId ? (
                    <input
                      type="number"
                      defaultValue={product.price}
                      onBlur={(e) => {
                        updatePrice(productId, e.target.value);
                        setEditingPrice(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updatePrice(productId, e.target.value);
                          setEditingPrice(null);
                        }
                      }}
                      autoFocus
                      style={{width: '80px', padding: '4px'}}
                    />
                  ) : (
                    <span onClick={() => setEditingPrice(productId)} style={{cursor: 'pointer'}}>
                      ₹{product.price || 0}
                    </span>
                  )}
                </td>
                <td>
                  {editingStock === productId ? (
                    <input
                      type="number"
                      defaultValue={product.stock}
                      onBlur={(e) => {
                        updateStock(productId, e.target.value);
                        setEditingStock(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateStock(productId, e.target.value);
                          setEditingStock(null);
                        }
                      }}
                      autoFocus
                      style={{width: '80px', padding: '4px'}}
                    />
                  ) : (
                    <span onClick={() => setEditingStock(productId)} style={{cursor: 'pointer'}}>
                      {product.stock || 0}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`status-badge ${product.stock > 5 ? 'in-stock' : 'low-stock'}`}>
                    {product.stock > 5 ? 'In Stock' : 'Low Stock'}
                  </span>
                </td>
                <td>
                  <button onClick={() => addStock(productId, 10)} className="stock-btn">
                    +10 Stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {Object.keys(inventory).length === 0 && (
          <div style={{textAlign: 'center', padding: '40px', color: '#999'}}>
            No inventory found for {selectedMachine}
          </div>
        )}
      </div>
    );
  };

  // Transactions Tab
  const TransactionsTab = () => (
    <div>
      <h2>Transaction History</h2>
      <table className="inventory-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Date</th>
            <th>Machine</th>
            <th>Items</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(txn => (
            <tr key={txn.id}>
              <td><strong>{txn.transactionId}</strong></td>
              <td>{txn.date}</td>
              <td>{txn.machineId}</td>
              <td>{txn.items?.length || 0} items</td>
              <td>₹{txn.totalAmount?.toFixed(2)}</td>
              <td>
                <span className="status-badge in-stock">
                  {txn.status || 'Completed'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && (
        <div style={{textAlign: 'center', padding: '40px', color: '#999'}}>
          No transactions found
        </div>
      )}
    </div>
  );

  // Machines Tab
  const MachinesTab = () => (
    <div>
      <h2>Machine Status</h2>
      <div className="machines-grid">
        {Object.entries(machines).map(([machineId, machine]) => {
          const isOnline = machine.status?.online || false;
          const lastHeartbeat = machine.status?.lastHeartbeat || 0;
          
          return (
            <div key={machineId} className="machine-card">
              <div className="machine-header">
                <h3>{machineId}</h3>
                <span className={`status-badge ${isOnline ? 'in-stock' : 'low-stock'}`}>
                  {isOnline ? '🟢 Online' : '🔴 Offline'}
                </span>
              </div>
              <div className="machine-info">
                <p><strong>Name:</strong> {machine.name || 'N/A'}</p>
                <p><strong>Location:</strong> {machine.location || 'N/A'}</p>
                <p><strong>Products:</strong> {Object.keys(machine.inventory || {}).length}</p>
                <p><strong>Last Heartbeat:</strong> {
                  lastHeartbeat 
                    ? new Date(lastHeartbeat * 1000).toLocaleString('en-IN')
                    : 'Never'
                }</p>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(machines).length === 0 && (
        <div style={{textAlign: 'center', padding: '40px', color: '#999'}}>
          No machines found
        </div>
      )}
    </div>
  );

  // ============ LOGIN SCREEN ============
  if (!isAuthenticated) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-container">
          <div className="admin-login-header">
            <div className="admin-icon">🔐</div>
            <h1>Admin Login</h1>
            <p>Vending Machine Management</p>
          </div>

          <form onSubmit={handleLogin} className="admin-login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="form-input"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="form-input"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {loginError && <div className="error-message">{loginError}</div>}

            <button 
              type="submit" 
              className="login-btn" 
              disabled={loginLoading || !username || !password}
            >
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="admin-login-footer">
  <p>Enter your credentials to continue</p>
</div>

        </div>
      </div>
    );
  }

  // ============ ADMIN DASHBOARD ============
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>🏪 Admin Dashboard</h1>
        <button onClick={onLogout} className="logout-btn">Logout</button>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          📦 Inventory
        </button>
        <button 
          className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          💳 Transactions
        </button>
        <button 
          className={`tab-btn ${activeTab === 'machines' ? 'active' : ''}`}
          onClick={() => setActiveTab('machines')}
        >
          🖥️ Machines
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
