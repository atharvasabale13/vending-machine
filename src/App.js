// src/App.js - FINAL VERSION WITH COLLECTION MESSAGE & 7-DAY COUPON
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { database } from './firebase';
import { ref, get, set, update, onValue } from 'firebase/database';
import emailjs from '@emailjs/browser';
import Admin from './Admin';
import './App.css';

// Configuration
const EMAILJS_SERVICE_ID = 'service_goajbuw';
const EMAILJS_TEMPLATE_ID = 'template_qwa3s96';
const EMAILJS_PUBLIC_KEY = 'SdaFtoVQpifXFXcp1';
const RAZORPAY_KEY_ID = 'rzp_test_RYR6kqiYhpWDq0';

// Utility: Load Razorpay
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// ============ COUNTDOWN TIMER ============
const CountdownTimer = ({ expiresAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = expiresAt - now;
      
      if (remaining <= 0) {
        if (onExpire) onExpire();
        return null;
      }
      
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      return { minutes, seconds, total: remaining };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (!timeLeft) return null;

  const isLowTime = timeLeft.total < 60;
  const isVeryLowTime = timeLeft.total < 30;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      padding: '12px 20px', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px',
      margin: '15px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      background: isVeryLowTime ? '#ff5252' : isLowTime ? '#ff9800' : '#4caf50',
      color: 'white', animation: isVeryLowTime ? 'pulse 1s infinite' : 'none'
    }}>
      <span style={{fontSize: '20px'}}>⏱️</span>
      <span>{timeLeft.minutes}:{timeLeft.seconds.toString().padStart(2, '0')}</span>
      <span style={{fontSize: '14px', opacity: 0.9}}>remaining</span>
    </div>
  );
};

// ============ PRICE BREAKDOWN ============
const PriceBreakdown = ({ subtotal, appliedCoupon, discount, total }) => (
  <div className="price-breakdown">
    <div className="price-row">
      <span>Subtotal:</span>
      <span>₹{subtotal.toFixed(2)}</span>
    </div>
    {appliedCoupon && (
      <div className="price-row discount-row">
        <span>Coupon ({appliedCoupon.discount}%):</span>
        <span>-₹{discount.toFixed(2)}</span>
      </div>
    )}
    <div className="cart-total">
      <strong>Total:</strong>
      <strong>₹{total.toFixed(2)}</strong>
    </div>
  </div>
);

// ============ MAIN APP COMPONENT ============
function App() {
  // State
  const [step, setStep] = useState('code-entry');
  const [showAdmin, setShowAdmin] = useState(false);
  const [code, setCode] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState(null);

  // Refs
  const couponInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Initialize
  useEffect(() => {
    console.log('🚀 App initialized');
    loadRazorpayScript();
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // ============ INVENTORY REAL-TIME LISTENER ============
  useEffect(() => {
    if (!machineId || step !== 'product-selection') {
      console.log('⏸️ Skipping inventory setup:', { machineId, step });
      return;
    }

    console.log('🔌 Setting up inventory listener for:', machineId);
    const inventoryPath = `machines/${machineId}/inventory`;
    const inventoryRef = ref(database, inventoryPath);

    const unsubscribe = onValue(
      inventoryRef,
      (snapshot) => {
        console.log('📦 Inventory snapshot received');
        
        if (snapshot.exists()) {
          const data = snapshot.val();
          console.log('📊 Raw data:', data);
          
          const productArray = Object.entries(data).map(([id, product]) => ({
            id,
            name: product.name || 'Unnamed',
            price: Number(product.price) || 0,
            stock: Number(product.stock) || 0,
            image: product.image || '📦'
          }));
          
          console.log('✅ Processed products:', productArray);
          
          const available = productArray.filter(p => p.stock > 0);
          console.log('✅ Available (stock > 0):', available);
          
          setProducts(available);
          
          setCart(prevCart => {
            const updated = prevCart.map(cartItem => {
              const product = productArray.find(p => p.id === cartItem.id);
              if (product && cartItem.quantity > product.stock) {
                console.log(`⚠️ Reducing ${cartItem.name}: ${cartItem.quantity} → ${product.stock}`);
                return { ...cartItem, quantity: product.stock, stock: product.stock };
              }
              return product ? { ...cartItem, stock: product.stock } : cartItem;
            }).filter(item => item.quantity > 0 && item.stock > 0);
            return updated;
          });
        } else {
          console.warn('⚠️ No data at:', inventoryPath);
          setProducts([]);
        }
      },
      (error) => {
        console.error('❌ Firebase error:', error);
        setProducts([]);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      console.log('🧹 Cleaning up inventory listener');
      unsubscribe();
    };
  }, [machineId, step]);

  // ============ CODE VERIFICATION ============
  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-character code');
      return;
    }

    if (code.toUpperCase() === 'ADMIN9') {
      console.log('🔐 Admin access');
      setShowAdmin(true);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionRef = ref(database, `sessions/${code.toUpperCase()}`);
      const snapshot = await get(sessionRef);

      if (!snapshot.exists()) {
        setError('Invalid code. Please check and try again.');
        setLoading(false);
        return;
      }

      const data = snapshot.val();
      console.log('📋 Session data:', data);
      
      const currentTime = Math.floor(Date.now() / 1000);

      if (data.status !== 'active') {
        setError('Code already used or invalid.');
        setLoading(false);
        return;
      }

      if (data.expiresAt <= currentTime) {
        setError('Code expired. Generate new code from machine.');
        setLoading(false);
        return;
      }

      await update(sessionRef, {
        isLoggedIn: true,
        loginTime: currentTime
      });

      console.log('✅ Session valid - Machine:', data.machineId);

      setMachineId(data.machineId);
      setSessionExpiresAt(data.expiresAt);
      setStep('product-selection');
      
    } catch (err) {
      console.error('❌ Verification error:', err);
      setError('Connection error. Please try again.');
    }

    setLoading(false);
  };

  // ============ CART FUNCTIONS ============
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Max stock: ${product.stock}`);
          return prev;
        }
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === productId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        return prev.map(i => i.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.id !== productId);
    });
  }, []);

  const getSubtotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const getTotalPrice = useCallback(() => {
    return Math.round((getSubtotal() - couponDiscount) * 100) / 100;
  }, [getSubtotal, couponDiscount]);

  // ============ COUPON FUNCTIONS ============
  const generateCouponCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const gen = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `VND-${gen()}-${gen()}`;
  };

  const saveCouponToFirebase = async (code, discount = 2) => {
    try {
      const now = Date.now();
      const expiry = now + (7 * 24 * 60 * 60 * 1000);
      const data = {
        code, discount, createdAt: now, expiresAt: expiry,
        expiryDate: new Date(expiry).toLocaleDateString('en-IN'),
        status: 'active', usedCount: 0, maxUses: 1
      };
      await set(ref(database, `coupons/${code}`), data);
      return data;
    } catch (error) {
      console.error('Coupon save error:', error);
      return null;
    }
  };

  const validateAndApplyCoupon = async () => {
    const code = (couponInputRef.current?.value || '').toUpperCase().trim();
    if (!code) {
      alert('Enter coupon code');
      return;
    }

    setLoading(true);
    try {
      const snapshot = await get(ref(database, `coupons/${code}`));
      if (!snapshot.exists()) {
        alert('❌ Invalid coupon');
        setLoading(false);
        return;
      }

      const data = snapshot.val();
      const now = Date.now();

      if (data.expiresAt < now) {
        alert('❌ Coupon expired');
        setLoading(false);
        return;
      }

      if (data.status === 'used' || data.usedCount >= data.maxUses) {
        alert('❌ Already used');
        setLoading(false);
        return;
      }

      const discount = Math.round((getSubtotal() * data.discount) / 100 * 100) / 100;
      setCouponDiscount(discount);
      setAppliedCoupon({ code, discount: data.discount, discountAmount: discount });
      alert(`✅ Saved ₹${discount.toFixed(2)} (${data.discount}% off)`);
    } catch (error) {
      console.error('Coupon error:', error);
      alert('❌ Error validating coupon');
    }
    setLoading(false);
  };

  const removeCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponDiscount(0);
    if (couponInputRef.current) couponInputRef.current.value = '';
  };

  // ============ PAYMENT ============
  const proceedToPayment = async () => {
    const total = getTotalPrice();
    const amountInPaise = Math.round(total * 100);

    if (!window.Razorpay) {
      alert('Loading payment gateway...');
      await loadRazorpayScript();
      return;
    }

    const options = {
      key: RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: 'INR',
      name: 'Vending Machine',
      description: `Purchase from ${machineId}`,
      handler: async (response) => {
        setLoading(true);
        await handlePaymentSuccess(response);
      },
      prefill: { name: 'Customer', email: userEmail || 'customer@example.com' },
      theme: { color: '#667eea' },
      modal: { ondismiss: () => console.log('Payment cancelled') }
    };

    new window.Razorpay(options).open();
  };

  const handlePaymentSuccess = async (paymentResponse) => {
    try {
      const txnId = paymentResponse.razorpay_payment_id;
      const timestamp = Date.now();
      const newCoupon = generateCouponCode();
      const newCouponData = await saveCouponToFirebase(newCoupon, 2);

      const receiptData = {
        transactionId: txnId,
        machineId, code,
        items: cart,
        subtotal: getSubtotal(),
        couponUsed: appliedCoupon?.code || null,
        couponDiscount: couponDiscount,
        totalAmount: getTotalPrice(),
        timestamp,
        date: new Date(timestamp).toLocaleString('en-IN'),
        paymentMethod: 'Razorpay',
        status: 'completed',
        newCoupon: { code: newCoupon, discount: 2, expiryDate: newCouponData.expiryDate }
      };

      await set(ref(database, `transactions/${txnId}`), receiptData);

      if (appliedCoupon) {
        await update(ref(database, `coupons/${appliedCoupon.code}`), {
          status: 'used', usedAt: timestamp
        });
      }

      await update(ref(database, `sessions/${code}`), {
        status: 'paid', paidAt: Math.floor(timestamp / 1000)
      });

      // Update inventory
      for (const item of cart) {
        const productRef = ref(database, `machines/${machineId}/inventory/${item.id}`);
        const snapshot = await get(productRef);
        if (snapshot.exists()) {
          const currentStock = snapshot.val().stock;
          await update(productRef, {
            stock: Math.max(0, currentStock - item.quantity),
            lastSold: Math.floor(Date.now() / 1000)
          });
        }
      }

      // Send dispense command
      await set(ref(database, `dispenseQueue/${code}`), {
        code, items: cart.map(i => ({ productId: i.id, quantity: i.quantity, name: i.name })),
        timestamp: Date.now()
      });

      setReceipt(receiptData);
      setStep('receipt');
      setLoading(false);
    } catch (error) {
      console.error('Payment processing error:', error);
      alert('Payment successful but error occurred. Contact support.');
      setLoading(false);
    }
  };

  // ============ EMAIL & DOWNLOAD ============
  const sendReceiptEmail = async () => {
    const email = emailInputRef.current?.value || userEmail;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      alert('Enter valid email');
      return;
    }

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        {
          to_email: email,
          transaction_id: receipt?.transactionId,
          date: receipt?.date,
          total_amount: receipt?.totalAmount
        },
        EMAILJS_PUBLIC_KEY
      );
      setUserEmail(email);
      setEmailSent(true);
      alert('Receipt sent! 📧');
    } catch (error) {
      alert('Failed to send email');
    }
  };

  const downloadReceipt = () => {
    const text = `
VENDING MACHINE RECEIPT
========================
Transaction: ${receipt?.transactionId}
Date: ${receipt?.date}
Machine: ${receipt?.machineId}

ITEMS:
${receipt?.items.map(i => `${i.name} x${i.quantity} - ₹${i.price * i.quantity}`).join('\n')}

Total: ₹${receipt?.totalAmount.toFixed(2)}
${receipt?.newCoupon ? `\nNEW COUPON: ${receipt.newCoupon.code}\n${receipt.newCoupon.discount}% OFF - Valid for 7 days\nExpires: ${receipt.newCoupon.expiryDate}\n` : ''}
Thank you! Please collect your items from the collection point.
    `;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${receipt?.transactionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============ LOGOUT WITH ENHANCED DEBUGGING ============
  const handleLogout = async () => {
    console.log('🔄 Logging out - Current state:', { 
      code, 
      step, 
      machineId,
      hasCode: !!code,
      isProductSelection: step === 'product-selection'
    });
    
    // IMPORTANT: Send cancellation to Firebase FIRST
    if (code) {
      try {
        console.log('📡 Sending cancellation to Firebase for code:', code.toUpperCase());
        const sessionRef = ref(database, `sessions/${code.toUpperCase()}`);
        
        // Update Firebase
        await update(sessionRef, {
          status: 'cancelled',
          cancelledAt: Math.floor(Date.now() / 1000)
        });
        
        console.log('✅ Session marked as cancelled in Firebase');
        
        // Verify the update
        const verifySnapshot = await get(sessionRef);
        if (verifySnapshot.exists()) {
          const verifyData = verifySnapshot.val();
          console.log('✅ Verification - Status in Firebase:', verifyData.status);
        }
        
        // Wait a moment to ensure Firebase propagates the update
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error('❌ Error marking session as cancelled:', error);
      }
    } else {
      console.warn('⚠️ No code to cancel');
    }
    
    // Clean up inventory listener
    if (unsubscribeRef.current) {
      console.log('🧹 Cleaning up inventory listener');
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // Reset all state
    console.log('🔄 Resetting all state...');
    setStep('code-entry');
    setCode('');
    setMachineId(null);
    setProducts([]);
    setCart([]);
    setError('');
    setReceipt(null);
    setUserEmail('');
    setEmailSent(false);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setSessionExpiresAt(null);
    setCodeExpiresAt(null);
    
    console.log('✅ State reset complete - Returned to code-entry');
  };

  // ============ RENDER SCREENS ============
  
  if (showAdmin) {
    return <Admin onLogout={() => { setShowAdmin(false); setCode(''); }} />;
  }

  if (step === 'code-entry') {
    return (
      <div className="screen">
        <div className="container">
          <h1>🏪 Vending Machine</h1>
          <p className="subtitle">Enter code from machine</p>
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
          <button onClick={verifyCode} disabled={loading || code.length !== 6} className="btn-primary">
            {loading ? 'Verifying...' : 'Continue →'}
          </button>
          <div className="help-text">
            <p>👉 Press button on machine for code</p>
            <p style={{fontSize: '12px', opacity: 0}}>Admin: ADMIN9</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'product-selection') {
    return (
      <div className="screen">
        <div className="container">
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
            <h1 style={{margin: 0}}>Select Products</h1>
            <button 
              onClick={() => {
                console.log('🔴 Exit button clicked');
                if (window.confirm('⚠️ Exit and cancel order?\n\nYour cart will be cleared.')) {
                  console.log('✅ User confirmed exit');
                  handleLogout();
                } else {
                  console.log('❌ User cancelled exit');
                }
              }}
              className="logout-btn-small"
            >
              ← Exit
            </button>
          </div>
          <p className="subtitle">Machine: {machineId} | Code: {code}</p>

          {sessionExpiresAt && <CountdownTimer expiresAt={sessionExpiresAt} onExpire={() => { alert('Session expired!'); handleLogout(); }} />}

          <div className="products-grid">
            {products.map(p => {
              const inCart = cart.find(i => i.id === p.id)?.quantity || 0;
              return (
                <div key={p.id} className={`product-card ${inCart > 0 ? 'in-cart' : ''}`}>
                  <div className="product-image">{p.image}</div>
                  <h3>{p.name}</h3>
                  <p className="price">₹{p.price}</p>
                  <p className="stock">Stock: {p.stock}</p>
                  {inCart > 0 ? (
                    <div className="quantity-controls">
                      <button onClick={() => removeFromCart(p.id)} className="qty-btn">−</button>
                      <span className="quantity">{inCart}</span>
                      <button onClick={() => addToCart(p)} className="qty-btn" disabled={inCart >= p.stock}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} className="add-btn">Add to Cart</button>
                  )}
                </div>
              );
            })}
          </div>

          {products.length === 0 && (
            <div className="empty-state">
              <p>❌ No products available</p>
              <p style={{fontSize: '12px', color: '#999'}}>Firebase: machines/{machineId}/inventory</p>
            </div>
          )}

          {cart.length > 0 && (
            <div className="cart-section">
              <h3>Cart ({cart.length})</h3>
              <div className="cart-items">
                {cart.map(i => (
                  <div key={i.id} className="cart-item">
                    <span>{i.image} {i.name}</span>
                    <span>x{i.quantity}</span>
                    <span>₹{i.price * i.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="coupon-section">
                <h4>🎟️ Coupon?</h4>
                {!appliedCoupon ? (
                  <div className="coupon-input-group">
                    <input ref={couponInputRef} type="text" placeholder="VND-XXXX-YYYY" className="coupon-input" maxLength="14" />
                    <button onClick={validateAndApplyCoupon} className="apply-coupon-btn">Apply</button>
                  </div>
                ) : (
                  <div className="applied-coupon">
                    <span className="coupon-badge">✓ {appliedCoupon.code}</span>
                    <button onClick={removeCoupon} className="remove-coupon-btn">✕</button>
                  </div>
                )}
              </div>

              <PriceBreakdown subtotal={getSubtotal()} appliedCoupon={appliedCoupon} discount={couponDiscount} total={getTotalPrice()} />
              
              <button onClick={proceedToPayment} className="btn-primary btn-large" disabled={loading}>
                Pay ₹{getTotalPrice().toFixed(2)} →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'receipt') {
    return (
      <div className="screen">
        <div className="container receipt-container">
          <div className="success-animation">
            <div className="checkmark">✓</div>
          </div>
          <h1>Payment Successful! 🎉</h1>

          {/* Collection Instructions */}
          <div className="instructions-box">
            <h4>📦 Please Collect Your Items</h4>
            <p>Your order is being dispensed now.</p>
            <p className="collection-point-text">
              👇 Collect from the collection point below 👇
            </p>
          </div>

          <div className="receipt-box">
            <h3>Receipt</h3>
            <div className="receipt-row">
              <span>Transaction:</span>
              <span>{receipt?.transactionId}</span>
            </div>
            <div className="receipt-row">
              <span>Date:</span>
              <span>{receipt?.date}</span>
            </div>
            <h4>Items:</h4>
            {receipt?.items.map((i, idx) => (
              <div key={idx} className="receipt-item">
                <span>{i.image} {i.name} x{i.quantity}</span>
                <span>₹{i.price * i.quantity}</span>
              </div>
            ))}
            <div className="receipt-row receipt-total">
              <span>Total:</span>
              <span>₹{receipt?.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* New Coupon with 7-day validity */}
          {receipt?.newCoupon && (
            <div className="new-coupon-box">
              <h3>🎉 Your Next Purchase Coupon!</h3>
              <div className="coupon-code-big">{receipt.newCoupon.code}</div>
              <div className="coupon-details">
                <p>💰 Get {receipt.newCoupon.discount}% OFF on your next order</p>
                <p>📅 Valid for 7 days until: {receipt.newCoupon.expiryDate}</p>
                <p className="coupon-note">⚠️ Single use only • Save this code!</p>
              </div>
            </div>
          )}

          <div className="email-section">
            <h4>📧 Email Receipt</h4>
            <div className="email-input-group">
              <input ref={emailInputRef} type="email" placeholder="your@email.com" className="email-input" disabled={emailSent} />
              <button onClick={sendReceiptEmail} className="btn-secondary" disabled={emailSent}>
                {emailSent ? '✓ Sent' : 'Send'}
              </button>
            </div>
          </div>

          <button onClick={downloadReceipt} className="btn-secondary">📥 Download Receipt</button>
          <button onClick={handleLogout} className="btn-primary" style={{marginTop: '10px'}}>← New Order</button>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
