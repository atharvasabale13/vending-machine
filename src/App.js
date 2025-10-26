// src/App.js - Complete Vending Machine with Admin Secret Code
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { database } from './firebase';
import { ref, get, update } from 'firebase/database';
import emailjs from '@emailjs/browser';
import './App.css';

// EmailJS Configuration
const EMAILJS_SERVICE_ID = 'service_goajbuw';
const EMAILJS_TEMPLATE_ID = 'template_qwa3s96';
const EMAILJS_PUBLIC_KEY = 'SdaFtoVQpifXFXcp1';

// Memoized Price Breakdown Component
const PriceBreakdown = React.memo(({ subtotal, appliedCoupon, discount, total }) => (
  <div className="price-breakdown">
    <div className="price-row">
      <span>Subtotal:</span>
      <span>₹{subtotal}</span>
    </div>
    {appliedCoupon && (
      <div className="price-row discount-row">
        <span>Coupon Discount ({appliedCoupon.discount}%):</span>
        <span>-₹{discount.toFixed(2)}</span>
      </div>
    )}
    <div className="cart-total">
      <strong>Total:</strong>
      <strong>₹{total}</strong>
    </div>
  </div>
));

function App() {
  // ============ STATE MANAGEMENT ============
  const [step, setStep] = useState('code-entry');
  const [code, setCode] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Refs for input focus management
  const couponInputRef = useRef(null);
  const emailInputRef = useRef(null);

  // Disable scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // ============ CODE VERIFICATION (WITH ADMIN SECRET CODE) ============
  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-character code');
      return;
    }

    // 🔐 SECRET ADMIN CODE - Redirect to Admin Panel
    if (code.toUpperCase() === 'ADMIN9') {
      window.location.href = '/admin';
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

  // ============ PRODUCT LOADING ============
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

  // ============ CART MANAGEMENT ============
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

  const getSubtotal = useCallback(() => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  const getTotalPrice = useCallback(() => {
    const subtotal = getSubtotal();
    return subtotal - couponDiscount;
  }, [getSubtotal, couponDiscount]);

  // ============ COUPON MANAGEMENT ============
  const generateCouponCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let part1 = '';
    let part2 = '';
    
    for (let i = 0; i < 4; i++) {
      part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `VND-${part1}-${part2}`;
  };

  const saveCouponToFirebase = async (couponCode, discount = 2) => {
    try {
      const currentTime = Date.now();
      const expiryTime = currentTime + (7 * 24 * 60 * 60 * 1000);
      
      const couponData = {
        code: couponCode,
        discount: discount,
        createdAt: currentTime,
        expiresAt: expiryTime,
        expiryDate: new Date(expiryTime).toLocaleDateString('en-IN'),
        status: 'active',
        usedCount: 0,
        maxUses: 1
      };
      
      await update(ref(database, `coupons/${couponCode}`), couponData);
      console.log(`✅ Coupon ${couponCode} saved to Firebase`);
      return couponData;
    } catch (error) {
      console.error('Error saving coupon:', error);
      return null;
    }
  };

  const validateAndApplyCoupon = async () => {
    const codeToValidate = couponInputRef.current?.value?.toUpperCase() || couponCode.toUpperCase();
    
    if (!codeToValidate || codeToValidate.trim() === '') {
      alert('Please enter a coupon code');
      return;
    }
    
    setLoading(true);
    
    try {
      const couponRef = ref(database, `coupons/${codeToValidate}`);
      const snapshot = await get(couponRef);
      
      if (!snapshot.exists()) {
        alert('❌ Invalid coupon code');
        setLoading(false);
        return;
      }
      
      const couponData = snapshot.val();
      const currentTime = Date.now();
      
      if (couponData.expiresAt < currentTime) {
        alert('❌ Coupon has expired');
        setLoading(false);
        return;
      }
      
      if (couponData.status === 'used' || couponData.usedCount >= couponData.maxUses) {
        alert('❌ Coupon has already been used');
        setLoading(false);
        return;
      }
      
      const discount = (getSubtotal() * couponData.discount) / 100;
      setCouponDiscount(discount);
      setAppliedCoupon({
        code: codeToValidate,
        discount: couponData.discount,
        discountAmount: discount
      });
      setCouponCode(codeToValidate);
      alert(`✅ Coupon applied! You saved ₹${discount.toFixed(2)} (${couponData.discount}% off)`);
      
    } catch (error) {
      console.error('Error validating coupon:', error);
      alert('❌ Error validating coupon');
    }
    
    setLoading(false);
  };

  const removeCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponDiscount(0);
    if (couponInputRef.current) {
      couponInputRef.current.value = '';
    }
  };

  // ============ PAYMENT (MOCK) ============
  const proceedToPayment = () => {
    const total = getTotalPrice();
    const itemsList = cart.map(item => `${item.name} x${item.quantity}`).join(', ');

    const confirmPayment = window.confirm(
      `🛒 Payment Confirmation\n\n` +
      `Items: ${itemsList}\n` +
      `Total Amount: ₹${total}\n\n` +
      `This is a test payment. Click OK to proceed\n` +
      `(Or Cancel to go back)`
    );

    if (confirmPayment) {
      setLoading(true);

      setTimeout(async () => {
        try {
          const mockTransactionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const mockResponse = {
            razorpay_payment_id: mockTransactionId
          };

          await handlePaymentSuccess(mockResponse);
        } catch (error) {
          console.error('Payment error:', error);
          setError('Payment processing failed. Please try again.');
        } finally {
          setLoading(false);
        }
      }, 2000);
    }
  };

  // ============ PAYMENT SUCCESS HANDLER ============
  const handlePaymentSuccess = async (paymentResponse) => {
    try {
      const transactionId = paymentResponse.razorpay_payment_id;
      const timestamp = Date.now();

      const newCouponCode = generateCouponCode();
      const newCouponData = await saveCouponToFirebase(newCouponCode, 2);

      const receiptData = {
        transactionId: transactionId,
        machineId: machineId,
        code: code,
        items: cart,
        subtotal: getSubtotal(),
        couponUsed: appliedCoupon ? appliedCoupon.code : null,
        couponDiscount: couponDiscount,
        totalAmount: getTotalPrice(),
        timestamp: timestamp,
        date: new Date(timestamp).toLocaleString('en-IN'),
        paymentMethod: 'Mock Payment',
        status: 'completed',
        newCoupon: {
          code: newCouponCode,
          discount: 2,
          expiryDate: newCouponData.expiryDate,
          expiresAt: newCouponData.expiresAt
        }
      };

      await update(ref(database, `transactions/${transactionId}`), receiptData);

      if (appliedCoupon) {
        const usedCouponRef = ref(database, `coupons/${appliedCoupon.code}`);
        const usedCouponSnapshot = await get(usedCouponRef);
        if (usedCouponSnapshot.exists()) {
          await update(usedCouponRef, {
            status: 'used',
            usedAt: timestamp,
            usedInTransaction: transactionId,
            usedCount: (usedCouponSnapshot.val().usedCount || 0) + 1
          });
        }
      }

      const sessionRef = ref(database, `sessions/${code}`);
      const sessionSnapshot = await get(sessionRef);
      const sessionData = sessionSnapshot.val();
      const isPermanentTestCode = sessionData && sessionData.expiresAt > 9000000000;

      if (isPermanentTestCode) {
        await update(sessionRef, {
          status: 'active',
          lastUsed: Math.floor(timestamp / 1000),
          lastTransactionId: transactionId,
          usageCount: (sessionData.usageCount || 0) + 1
        });
      } else {
        await update(sessionRef, {
          status: 'paid',
          transactionId: transactionId,
          paidAt: Math.floor(timestamp / 1000)
        });
      }

      await sendDispenseCommand(cart);
      await updateInventory(cart);

      setReceipt(receiptData);
      setStep('receipt');

    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Payment successful but there was an error. Please contact support.');
    }
  };

  // ============ DISPENSE COMMAND ============
  const sendDispenseCommand = async (items) => {
    try {
      const dispenseData = {
        code: code,
        items: items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          name: item.name
        })),
        timestamp: Date.now()
      };

      await update(ref(database, `dispenseQueue/${code}`), dispenseData);
      console.log('Dispense command sent to Pi');
    } catch (error) {
      console.error('Error sending dispense command:', error);
    }
  };

  // ============ INVENTORY UPDATE ============
  const updateInventory = async (items) => {
    try {
      for (const item of items) {
        const productRef = ref(database, `machines/${machineId}/inventory/${item.id}`);
        const snapshot = await get(productRef);
        
        if (snapshot.exists()) {
          const currentStock = snapshot.val().stock;
          const newStock = Math.max(0, currentStock - item.quantity);
          
          await update(productRef, {
            stock: newStock,
            lastSold: Math.floor(Date.now() / 1000)
          });
        }
      }
      console.log('Inventory updated');
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  // ============ EMAIL RECEIPT ============
  const sendReceiptEmail = async () => {
    const emailToSend = emailInputRef.current?.value || userEmail;
    
    if (!emailToSend || !/\S+@\S+\.\S+/.test(emailToSend)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      const itemsHtml = receipt?.items.map(item => `
        <tr>
          <td>${item.image} ${item.name}</td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">₹${item.price}</td>
          <td style="text-align: right;">₹${item.price * item.quantity}</td>
        </tr>
      `).join('');

      const templateParams = {
        user_name: 'Valued Customer',
        to_email: emailToSend,
        reply_to: emailToSend,
        user_email: emailToSend,
        transaction_id: receipt?.transactionId,
        date: receipt?.date,
        machine_id: receipt?.machineId,
        items_html: itemsHtml,
        total_amount: receipt?.totalAmount,
        payment_method: receipt?.paymentMethod
      };

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );

      setUserEmail(emailToSend);
      setEmailSent(true);
      alert('Receipt sent to your email successfully! 📧');
    } catch (error) {
      console.error('Email send failed:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  // ============ DOWNLOAD RECEIPT ============
  const downloadReceipt = () => {
    const receiptText = `
================================
VENDING MACHINE RECEIPT
================================

Transaction ID: ${receipt?.transactionId}
Date: ${receipt?.date}
Machine ID: ${receipt?.machineId}

--------------------------------
ITEMS PURCHASED
--------------------------------
${receipt?.items.map(item => 
  `${item.name} x${item.quantity} - ₹${item.price * item.quantity}`
).join('\n')}

--------------------------------
Subtotal: ₹${receipt?.subtotal}
${receipt?.couponUsed ? `Coupon (${receipt.couponUsed}): -₹${receipt.couponDiscount.toFixed(2)}\n` : ''}Total: ₹${receipt?.totalAmount}
Payment Method: ${receipt?.paymentMethod}
--------------------------------

${receipt?.newCoupon ? `🎉 NEW COUPON EARNED! 🎉
Code: ${receipt.newCoupon.code}
Discount: ${receipt.newCoupon.discount}% OFF
Valid until: ${receipt.newCoupon.expiryDate}

` : ''}Thank you for your purchase!
================================
    `;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt_${receipt?.transactionId}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // ============ LOGOUT FUNCTION ============
  const handleLogout = () => {
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
  };

  // ============ UI SCREENS ============

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
          <p style={{fontSize: '12px', opacity: 0.5, marginTop: '10px'}}>💡 Admin? Enter ADMIN9</p>
        </div>
      </div>
    </div>
  );

  const ProductSelectionScreen = () => {
    const getCartQuantity = useCallback((productId) => {
      const item = cart.find(item => item.id === productId);
      return item ? item.quantity : 0;
    }, []);

    return (
      <div className="screen">
        <div className="container">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <h1 style={{margin: 0}}>Select Your Products</h1>
            <button 
              onClick={handleLogout}
              className="logout-btn-small"
            >
              ← Exit
            </button>
          </div>
          
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

              {/* Coupon Section - MOBILE FIXED */}
              <div className="coupon-section">
                <h4>🎟️ Have a Coupon?</h4>
                {!appliedCoupon ? (
                  <div className="coupon-input-group">
                    <input
                      ref={couponInputRef}
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck="false"
                      defaultValue={couponCode}
                      onInput={(e) => {
                        e.target.value = e.target.value.toUpperCase();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          validateAndApplyCoupon();
                        }
                      }}
                      placeholder="VND-XXXX-YYYY"
                      className="coupon-input"
                      maxLength="14"
                    />
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        validateAndApplyCoupon();
                      }}
                      className="apply-coupon-btn"
                      disabled={loading}
                    >
                      Apply
                    </button>
                  </div>
                ) : (
                  <div className="applied-coupon">
                    <div className="coupon-info">
                      <span className="coupon-badge">✓ {appliedCoupon.code}</span>
                      <span className="coupon-saving">-₹{appliedCoupon.discountAmount.toFixed(2)} ({appliedCoupon.discount}% off)</span>
                    </div>
                    <button onClick={removeCoupon} className="remove-coupon-btn">
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <PriceBreakdown 
                subtotal={getSubtotal()}
                appliedCoupon={appliedCoupon}
                discount={couponDiscount}
                total={getTotalPrice()}
              />

              <button 
                onClick={proceedToPayment}
                className="btn-primary btn-large"
                disabled={loading}
              >
                {loading ? 'Processing...' : `Pay ₹${getTotalPrice()} →`}
              </button>
              <div className="payment-methods">
                <p>💳 Mock Payment (Test Mode)</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ReceiptScreen = () => (
    <div className="screen">
      <div className="container receipt-container">
        <div style={{textAlign: 'right', marginBottom: '-20px'}}>
          <button 
            onClick={handleLogout}
            className="logout-btn-small"
          >
            ← Exit
          </button>
        </div>

        <div className="success-animation">
          <div className="checkmark">✓</div>
        </div>
        
        <h1>Payment Successful! 🎉</h1>
        <p className="subtitle">Your order is being prepared</p>

        <div className="receipt-box">
          <h3>Digital Receipt</h3>
          
          <div className="receipt-row">
            <span>Transaction ID:</span>
            <span className="receipt-value">{receipt?.transactionId}</span>
          </div>
          
          <div className="receipt-row">
            <span>Date & Time:</span>
            <span className="receipt-value">{receipt?.date}</span>
          </div>
          
          <div className="receipt-row">
            <span>Machine ID:</span>
            <span className="receipt-value">{receipt?.machineId}</span>
          </div>

          <div className="receipt-divider"></div>

          <h4>Items Purchased:</h4>
          {receipt?.items.map((item, index) => (
            <div key={index} className="receipt-item">
              <span>{item.image} {item.name} x{item.quantity}</span>
              <span>₹{item.price * item.quantity}</span>
            </div>
          ))}

          <div className="receipt-divider"></div>

          <div className="receipt-row">
            <span>Subtotal:</span>
            <span className="receipt-value">₹{receipt?.subtotal}</span>
          </div>

          {receipt?.couponUsed && (
            <div className="receipt-row" style={{color: '#4caf50'}}>
              <span>Coupon ({receipt.couponUsed}):</span>
              <span className="receipt-value">-₹{receipt.couponDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="receipt-row receipt-total">
            <span>Total Paid:</span>
            <span>₹{receipt?.totalAmount}</span>
          </div>

          <div className="receipt-row">
            <span>Payment Method:</span>
            <span className="receipt-value">{receipt?.paymentMethod}</span>
          </div>
        </div>

        {receipt?.newCoupon && (
          <div className="new-coupon-box">
            <h3>🎉 Congratulations!</h3>
            <p>You've earned a discount coupon for your next purchase!</p>
            <div className="coupon-display">
              <div className="coupon-code-big">{receipt.newCoupon.code}</div>
              <div className="coupon-details">
                <p><strong>{receipt.newCoupon.discount}% OFF</strong> on your next order</p>
                <p>Valid until: <strong>{receipt.newCoupon.expiryDate}</strong></p>
                <p className="coupon-note">Use this code at checkout</p>
              </div>
            </div>
          </div>
        )}

        <div className="instructions-box">
          <h4>📦 Collect Your Products</h4>
          <p>Your products are being dispensed from the vending machine.</p>
          <p>Please collect them from the collection area.</p>
        </div>

        {/* Email Section - MOBILE FIXED */}
        <div className="email-section">
          <h4>📧 Email Receipt</h4>
          <div className="email-input-group">
            <input
              ref={emailInputRef}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              spellCheck="false"
              defaultValue={userEmail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !emailSent) {
                  e.preventDefault();
                  sendReceiptEmail();
                }
              }}
              placeholder="Enter your email"
              className="email-input"
              disabled={emailSent}
            />
            <button 
              onClick={(e) => {
                e.preventDefault();
                sendReceiptEmail();
              }}
              className="btn-secondary"
              disabled={emailSent}
            >
              {emailSent ? '✓ Sent' : 'Send Receipt'}
            </button>
          </div>
        </div>

        <button 
          onClick={downloadReceipt}
          className="btn-secondary"
        >
          📥 Download Receipt
        </button>

        <button 
          onClick={() => window.print()}
          className="btn-secondary"
          style={{ marginTop: '10px' }}
        >
          🖨️ Print Receipt
        </button>

        <button 
          onClick={handleLogout}
          className="btn-primary"
          style={{ marginTop: '10px' }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div className="app">
      {step === 'code-entry' && <CodeEntryScreen />}
      {step === 'product-selection' && <ProductSelectionScreen />}
      {step === 'receipt' && <ReceiptScreen />}
    </div>
  );
}

export default App;
