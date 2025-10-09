// src/App.js - Complete File

import React, { useState } from 'react';
import { database } from './firebase';
import { ref, get } from 'firebase/database';
import './App.css';

function App() {
  const [step, setStep] = useState('code-entry');
  const [code, setCode] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          setError('Code has expired. Please generate a new code from the machine.');
        } else {
          setError('Code has already been used or is invalid.');
        }
      } else {
        setError('Invalid code. Please check and try again.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('Connection error. Please try again.');
    }

    setLoading(false);
  };

  const loadProducts = async (machineId) => {
    try {
      const productsRef = ref(database, `machines/${machineId}/inventory`);
      const snapshot = await get(productsRef);

      if (snapshot.exists()) {
        const productsData = snapshot.val();
        const productList = Object.keys(productsData).map(key => ({
          id: key,
          ...productsData[key]
        }));
        setProducts(productList.filter(p => p.stock > 0));
      } else {
        setProducts([
          { id: 'product1', name: 'Chips', price: 20, stock: 10, image: '🍟' },
          { id: 'product2', name: 'Cookies', price: 30, stock: 8, image: '🍪' },
          { id: 'product3', name: 'Juice', price: 40, stock: 5, image: '🧃' },
          { id: 'product4', name: 'Chocolate', price: 50, stock: 12, image: '🍫' }
        ]);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to load products');
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity < product.stock) {
        setCart(cart.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      } else {
        alert(`Maximum stock available: ${product.stock}`);
      }
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem.quantity > 1) {
      setCart(cart.map(item => 
        item.id === productId 
          ? { ...item, quantity: item.quantity - 1 }
          : item
      ));
    } else {
      setCart(cart.filter(item => item.id !== productId));
    }
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const proceedToPayment = () => {
    const itemsList = cart.map(item => `${item.name} x${item.quantity}`).join(', ');
    alert(`Payment for:\n${itemsList}\n\nTotal: ₹${getTotalPrice()}\n\nPayment gateway will be added in Step 6!`);
  };

  const CodeEntryScreen = () => (
    <div className="screen">
      <div className="container">
        <h1>🏪 Vending Machine</h1>
        <p className="subtitle">Enter the code displayed on the machine</p>

        <div className="code-input-wrapper">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            maxLength="6"
            className="code-input"
            autoFocus
          />
        </div>

        {error && <div className="error">{error}</div>}

        <button 
          onClick={verifyCode} 
          disabled={loading || code.length !== 6}
          className="btn-primary"
        >
          {loading ? 'Verifying...' : 'Continue →'}
        </button>

        <div className="help-text">
          <p>👉 Press the button on the vending machine to get your code</p>
        </div>
      </div>
    </div>
  );

  const ProductSelectionScreen = () => {
    const getCartQuantity = (productId) => {
      const item = cart.find(item => item.id === productId);
      return item ? item.quantity : 0;
    };

    return (
      <div className="screen">
        <div className="container">
          <h1>Select Your Products</h1>
          <p className="subtitle">Machine: {machineId} | Code: {code}</p>

          <div className="products-grid">
            {products.map(product => {
              const inCart = getCartQuantity(product.id);
              return (
                <div 
                  key={product.id}
                  className={`product-card ${inCart > 0 ? 'in-cart' : ''}`}
                >
                  <div className="product-image">{product.image || '📦'}</div>
                  <h3>{product.name}</h3>
                  <p className="price">₹{product.price}</p>
                  <p className="stock">Stock: {product.stock}</p>
                  
                  {inCart > 0 ? (
                    <div className="quantity-controls">
                      <button 
                        onClick={() => removeFromCart(product.id)}
                        className="qty-btn"
                      >
                        −
                      </button>
                      <span className="quantity">{inCart}</span>
                      <button 
                        onClick={() => addToCart(product)}
                        className="qty-btn"
                        disabled={inCart >= product.stock}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => addToCart(product)}
                      className="add-btn"
                    >
                      Add to Cart
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {products.length === 0 && (
            <div className="empty-state">
              <p>No products available at this machine</p>
            </div>
          )}

          {cart.length > 0 && (
            <div className="cart-section">
              <h3>Your Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})</h3>
              <div className="cart-items">
                {cart.map(item => (
                  <div key={item.id} className="cart-item">
                    <span>{item.image} {item.name}</span>
                    <span>x{item.quantity}</span>
                    <span>₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="cart-total">
                <strong>Total:</strong>
                <strong>₹{getTotalPrice()}</strong>
              </div>
              <button 
                onClick={proceedToPayment}
                className="btn-primary btn-large"
              >
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
      {step === 'code-entry' && <CodeEntryScreen />}
      {step === 'product-selection' && <ProductSelectionScreen />}
    </div>
  );
}

export default App;
