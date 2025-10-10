

// src/App.js
import React, { useState } from 'react';
import { database } from './firebase';
import { ref, get } from 'firebase/database';
import './App.css';

const App = () => {
  const [step, setStep] = useState('code-entry');
  const [code, setCode] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Verify the entered code
  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-character code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionRef = ref(database, `sessions/${code.toUpperCase()}`);
      const snapshot = await get(sessionRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const currentTime = Math.floor(Date.now() / 1000);

        if (data.status === 'active' && data.expiresAt > currentTime) {
          setMachineId(data.machineId);
          loadProducts(data.machineId);
          setStep('product-selection');
        } else if (data.expiresAt <= currentTime) {
          setError('Code has expired. Please generate a new code.');
        } else {
          setError('Code already used or invalid.');
        }
      } else {
        setError('Invalid code. Try again.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Please try again.');
    }

    setLoading(false);
  };

  // Load products from Firebase
  const loadProducts = async (machineId) => {
    try {
      const productsRef = ref(database, `machines/${machineId}/inventory`);
      const snapshot = await get(productsRef);

      if (snapshot.exists()) {
        const productList = Object.keys(snapshot.val()).map(key => ({
          id: key,
          ...snapshot.val()[key],
        }));
        setProducts(productList.filter(p => p.stock > 0));
      } else {
        // Default products if DB empty
        setProducts([
          { id: 'product1', name: 'Chips', price: 20, stock: 10, image: '🍟' },
          { id: 'product2', name: 'Cookies', price: 30, stock: 8, image: '🍪' },
          { id: 'product3', name: 'Juice', price: 40, stock: 5, image: '🧃' },
          { id: 'product4', name: 'Chocolate', price: 50, stock: 12, image: '🍫' }
        ]);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load products');
    }
  };

  // Add product to cart
  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity < product.stock) {
        setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        alert(`Max stock available: ${product.stock}`);
      }
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  // Remove product from cart
  const removeFromCart = (productId) => {
    const existing = cart.find(item => item.id === productId);
    if (existing.quantity > 1) {
      setCart(cart.map(item => item.id === productId ? { ...item, quantity: item.quantity - 1 } : item));
    } else {
      setCart(cart.filter(item => item.id !== productId));
    }
  };

  const getTotalPrice = () => cart.reduce((total, item) => total + item.price * item.quantity, 0);

  const proceedToPayment = () => {
    const itemsList = cart.map(item => `${item.name} x${item.quantity}`).join(', ');
    alert(`Payment for:\n${itemsList}\nTotal: ₹${getTotalPrice()}\n(Payment gateway will be added later)`);
  };

  // Screens
  const CodeEntryScreen = () => (
    <div className="screen">
      <div className="container">
        <h1>🏪 Vending Machine</h1>
        <p className="subtitle">Enter the code displayed on the machine</p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          maxLength={6}
          autoFocus
          className="code-input"
        />
        {error && <div className="error">{error}</div>}
        <button onClick={verifyCode} disabled={loading || code.length !== 6} className="btn-primary">
          {loading ? 'Verifying...' : 'Continue →'}
        </button>
        <p className="help-text">👉 Press the button on the vending machine to get your code</p>
      </div>
    </div>
  );

  const ProductSelectionScreen = () => {
    const getCartQty = (id) => (cart.find(item => item.id === id)?.quantity || 0);

    return (
      <div className="screen">
        <div className="container">
          <h1>Select Your Products</h1>
          <p className="subtitle">Machine: {machineId} | Code: {code}</p>

          <div className="products-grid">
            {products.map(p => {
              const qty = getCartQty(p.id);
              return (
                <div key={p.id} className={`product-card ${qty > 0 ? 'in-cart' : ''}`}>
                  <div className="product-image">{p.image || '📦'}</div>
                  <h3>{p.name}</h3>
                  <p className="price">₹{p.price}</p>
                  <p className="stock">Stock: {p.stock}</p>

                  {qty > 0 ? (
                    <div className="quantity-controls">
                      <button onClick={() => removeFromCart(p.id)} className="qty-btn">−</button>
                      <span className="quantity">{qty}</span>
                      <button onClick={() => addToCart(p)} className="qty-btn" disabled={qty >= p.stock}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} className="add-btn">Add to Cart</button>
                  )}
                </div>
              );
            })}
          </div>

          {products.length === 0 && <p>No products available at this machine</p>}

          {cart.length > 0 && (
            <div className="cart-section">
              <h3>Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})</h3>
              {cart.map(item => (
                <div key={item.id} className="cart-item">
                  <span>{item.image} {item.name}</span>
                  <span>x{item.quantity}</span>
                  <span>₹{item.price * item.quantity}</span>
                </div>
              ))}
              <div className="cart-total"><strong>Total: ₹{getTotalPrice()}</strong></div>
              <button onClick={proceedToPayment} className="btn-primary btn-large">
                Proceed to Payment ₹{getTotalPrice()}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      {step === 'code-entry' ? <CodeEntryScreen /> : <ProductSelectionScreen />}
    </div>
  );
};

export default App;
