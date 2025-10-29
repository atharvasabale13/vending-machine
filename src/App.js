// src/App.js - Fixed version with no reloading and real-time sync
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { database } from './firebase';
import { ref, get, update, onValue } from 'firebase/database';
import emailjs from '@emailjs/browser';
import Admin from './Admin';
import './App.css';

// EmailJS Configuration
const EMAILJS_SERVICE_ID = 'service_goajbuw';
const EMAILJS_TEMPLATE_ID = 'template_qwa3s96';
const EMAILJS_PUBLIC_KEY = 'SdaFtoVQpifXFXcp1';

// Razorpay Configuration
const RAZORPAY_KEY_ID = 'rzp_test_RYR6kqiYhpWDq0';

// Load Razorpay script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// ============ COUNTDOWN TIMER COMPONENT ============
const CountdownTimer = React.memo(({ expiresAt, onExpire }) => {
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

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (!timeLeft) return null;

  const isLowTime = timeLeft.total < 60;
  const isVeryLowTime = timeLeft.total < 30;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 20px',
      background: isVeryLowTime ? '#ff5252' : isLowTime ? '#ff9800' : '#4caf50',
      color: 'white',
      borderRadius: '12px',
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '15px 0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      animation: isVeryLowTime ? 'pulse 1s infinite' : 'none'
    }}>
      <span style={{fontSize: '20px'}}>⏱️</span>
      <span>
        {timeLeft.minutes}:{timeLeft.seconds.toString().padStart(2, '0')}
      </span>
      <span style={{fontSize: '14px', opacity: 0.9}}>remaining</span>
    </div>
  );
});

// Memoized Price Breakdown Component
const PriceBreakdown = React.memo(({ subtotal, appliedCoupon, discount, total }) => (
  <div className="price-breakdown">
    <div className="price-row">
      <span>Subtotal:</span>
      <span>₹{subtotal.toFixed(2)}</span>
    </div>
    {appliedCoupon && (
      <div className="price-row discount-row">
        <span>Coupon Discount ({appliedCoupon.discount}%):</span>
        <span>-₹{discount.toFixed(2)}</span>
      </div>
    )}
    <div className="cart-total">
      <strong>Total:</strong>
      <strong>₹{total.toFixed(2)}</strong>
    </div>
  </div>
));

function App() {
  // ============ STATE MANAGEMENT ============
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
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Timer states
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState(null);

  // Refs
  const couponInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const inventoryListenerRef = useRef(null);

  // ============ INITIALIZATION ============
  useEffect(() => {
    console.log('🚀 App initialized');
    loadRazorpayScript();
    
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    return () => {
      console.log('🧹 Cleanup on unmount');
      // Clean up inventory listener
      if (inventoryListenerRef.current) {
        inventoryListenerRef.current();
      }
    };
  }, []);

  // ============ REAL-TIME INVENTORY SYNC ============
  useEffect(() => {
    if (machineId && step === 'product-selection') {
      console.log('👂 Setting up real-time inventory listener for:', machineId);
      
      const inventoryRef = ref(database, `machines/${machineId}/inventory`);
      
      // Listen for real-time updates
      const unsubscribe = onValue(inventoryRef, (snapshot) => {
        if (snapshot.exists()) {
          const productsData = snapshot.val();
          console.log('🔄 Inventory updated from Firebase');
          
          const productList = Object.keys(productsData).map(key => ({
            id: key,
            ...productsData[key]
          }));
          
          // Update products with available stock
          const availableProducts = productList.filter(p => p.stock > 0);
          setProducts(availableProducts);
          
          // Update cart quantities if stock changed
          setCart(prevCart => 
            prevCart.map(item => {
              const updatedProduct = productList.find(p => p.id === item.id);
              if (updatedProduct && item.quantity > updatedProduct.stock) {
                console.log(`⚠️ Adjusting ${item.name} quantity from ${item.quantity} to ${updatedProduct.stock}`);
                return { ...item, quantity: updatedProduct.stock };
              }
              return item;
            }).filter(item => item.quantity > 0) // Remove items with 0 stock
          );
        }
      });

      // Store unsubscribe function
      inventoryListenerRef.current = unsubscribe;

      // Cleanup listener when component unmounts or machineId changes
      return () => {
        console.log('🛑 Cleaning up inventory listener');
        unsubscribe();
      };
    }
  }, [machineId, step]);

  // Check code expiry
  const checkCodeExpiry = useCallback(async (codeToCheck) => {
    if (codeToCheck.length !== 6) {
      setCodeExpiresAt(null);
      return;
    }

    try {
      const sessionRef = ref(database, `sessions/${codeToCheck.toUpperCase()}`);
      const snapshot = await get(sessionRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const currentTime = Math.floor(Date.now() / 1000);

        if (data.status === 'active' && data.expiresAt > currentTime) {
          setCodeExpiresAt(data.expiresAt);
          setError('');
        } else if (data.expiresAt <= currentTime) {
          setCodeExpiresAt(null);
          setError('Code has expired');
        } else {
          setCodeExpiresAt(null);
          setError('Code already used');
        }
      } else {
        setCodeExpiresAt(null);
      }
    } catch (err) {
      console.error('Error checking code:', err);
    }
  }, []);

  // Debounced code check
  useEffect(() => {
    if (code.length === 6 && step === 'code-entry') {
      const timer = setTimeout(() => {
        checkCodeExpiry(code);
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setCodeExpiresAt(null);
    }
  }, [code, step, checkCodeExpiry]);

  // ============ CODE VERIFICATION ============
  const verifyCode = useCallback(async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-character code');
      return;
    }

    if (code.toUpperCase() === 'ADMIN9') {
      console.log('🔐 Admin access granted');
      setShowAdmin(true);
      setError('');
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
          await update(sessionRef, {
            isLoggedIn: true,
            loginTime: currentTime
          });
          
          console.log('✅ Session validated');
          
          setMachineId(data.machineId);
          setSessionExpiresAt(data.expiresAt);
          setStep('product-selection');
        } else if (data.expiresAt <= currentTime) {
          setError('Code has expired. Please generate a new code from the machine.');
          setCodeExpiresAt(null);
        } else {
          setError('Code has already been used or is invalid.');
          setCodeExpiresAt(null);
        }
      } else {
        setError('Invalid code. Please check and try again.');
        setCodeExpiresAt(null);
      }
    } catch (err) {
      console.error('❌ Verification error:', err);
      setError('Connection error. Please try again.');
    }

    setLoading(false);
  }, [code]);

  // ============ CART MANAGEMENT ============
  const addToCart = useCallback((product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      
      if (existingItem) {
        if (existingItem.quantity < product.stock) {
          return prevCart.map(item => 
            item.id === product.id 
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
          alert(`Maximum stock available: ${product.stock}`);
          return prevCart;
        }
      } else {
        return [...prevCart, { ...product, quantity: 1 }];
      }
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === productId);
      
      if (existingItem.quantity > 1) {
        return prevCart.map(item => 
          item.id === productId 
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      } else {
        return prevCart.filter(item => item.id !== productId);
      }
    });
  }, []);

  const getSubtotal = useCallback(() => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  const getTotalPrice = useCallback(() => {
    const subtotal = getSubtotal();
    const total = subtotal - couponDiscount;
    return Math.round(total * 100) / 100;
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

  const validateAndApplyCoupon = useCallback(async () => {
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
      
      const rawDiscount = (getSubtotal() * couponData.discount) / 100;
      const discount = Math.round(rawDiscount * 100) / 100;
      
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
  }, [couponCode, getSubtotal]);

  const removeCoupon = useCallback(() => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponDiscount(0);
    if (couponInputRef.current) {
      couponInputRef.current.value = '';
    }
  }, []);

  // ============ RAZORPAY PAYMENT ============
  const proceedToPayment = useCallback(async () => {
    const total = getTotalPrice();
    const amountInPaise = Math.round(total * 100);
    const itemsList = cart.map(item => `${item.name} x${item.quantity}`).join(', ');

    console.log('💳 Payment initiated:', {
      subtotal: getSubtotal(),
      discount: couponDiscount.toFixed(2),
      total: total.toFixed(2),
      amountInPaise: amountInPaise
    });

    if (!window.Razorpay) {
      alert('Payment gateway is loading. Please try again in a moment.');
      await loadRazorpayScript();
      return;
    }

    try {
      const options = {
        key: RAZORPAY_KEY_ID,
        amount: amountInPaise,
        currency: 'INR',
        name: 'Vending Machine',
        description: `Purchase: ${itemsList}`,
        image: '',
        handler: async function (response) {
          console.log('✅ Payment successful!', response);
          setLoading(true);
          await handlePaymentSuccess(response);
        },
        prefill: {
          name: 'Customer',
          email: userEmail || 'customer@example.com',
          contact: ''
        },
        notes: {
          machineId: machineId,
          sessionCode: code,
          items: itemsList,
          amount: total.toFixed(2)
        },
        theme: {
          color: '#667eea'
        },
        modal: {
          ondismiss: function() {
            console.log('Payment cancelled by user');
          },
          escape: true,
          backdropclose: true,
          confirm_close: true
        }
      };

      const razorpayInstance = new window.Razorpay(options);
      
      razorpayInstance.on('payment.failed', function (response) {
        if (!response.error.description.includes('test') && 
            response.error.reason !== 'payment_cancelled') {
          alert('❌ Payment failed!\n\n' + response.error.description);
        }
        console.log('Payment error:', response.error);
      });

      razorpayInstance.open();

    } catch (error) {
      console.error('Payment error:', error);
      alert('Error initializing payment. Please try again.');
      setLoading(false);
    }
  }, [cart, code, couponDiscount, getSubtotal, getTotalPrice, machineId, userEmail]);

  // ============ PAYMENT SUCCESS HANDLER ============
  const handlePaymentSuccess = async (paymentResponse) => {
    try {
      const transactionId = paymentResponse.razorpay_payment_id;
      const timestamp = Date.now();

      const newCouponCode = generateCouponCode();
      const newCouponData = await saveCouponToFirebase(newCouponCode, 2);

      const subtotal = Math.round(getSubtotal() * 100) / 100;
      const discount = Math.round(couponDiscount * 100) / 100;
      const totalAmount = Math.round(getTotalPrice() * 100) / 100;

      const receiptData = {
        transactionId: transactionId,
        razorpayOrderId: paymentResponse.razorpay_order_id || '',
        razorpaySignature: paymentResponse.razorpay_signature || '',
        machineId: machineId,
        code: code,
        items: cart,
        subtotal: subtotal,
        couponUsed: appliedCoupon ? appliedCoupon.code : null,
        couponDiscount: discount,
        totalAmount: totalAmount,
        timestamp: timestamp,
        date: new Date(timestamp).toLocaleString('en-IN'),
        paymentMethod: 'Razorpay',
        paymentStatus: 'completed',
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
      setLoading(false);

    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Payment successful but there was an error. Please contact support with transaction ID: ' + paymentResponse.razorpay_payment_id);
      setLoading(false);
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
      console.log('✅ Dispense command sent to Pi');
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
      console.log('✅ Inventory updated');
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
Subtotal: ₹${receipt?.subtotal.toFixed(2)}
${receipt?.couponUsed ? `Coupon (${receipt.couponUsed}): -₹${receipt.couponDiscount.toFixed(2)}\n` : ''}Total: ₹${receipt?.totalAmount.toFixed(2)}
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

  // ============ LOGOUT/CANCEL FUNCTIONS ============
  const handleLogout = useCallback(async () => {
    console.log('🔄 Logging out...');
    
    if (code && step === 'product-selection') {
      try {
        const sessionRef = ref(database, `sessions/${code.toUpperCase()}`);
        await update(sessionRef, {
          status: 'cancelled',
          cancelledAt: Math.floor(Date.now() / 1000)
        });
        console.log('✅ Session marked as cancelled');
      } catch (error) {
        console.error('Error marking session as cancelled:', error);
      }
    }
    
    // Clean up inventory listener
    if (inventoryListenerRef.current) {
      inventoryListenerRef.current();
      inventoryListenerRef.current = null;
    }
    
    // Reset all state
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
    
    console.log('✅ State reset to code-entry');
  }, [code, step]);

  const handleAdminLogout = useCallback(() => {
    console.log('🔐 Admin logout');
    setShowAdmin(false);
    setCode('');
    setError('');
  }, []);

  // ============ UI SCREENS ============

  const CodeEntryScreen = () => {
    const handleCodeExpire = useCallback(() => {
      setCodeExpiresAt(null);
      setError('Code has expired. Please generate a new code from the machine.');
    }, []);

    const handleCodeChange = useCallback((e) => {
      setCode(e.target.value.toUpperCase());
    }, []);

    return (
      <div className="screen">
        <div className="container">
          <h1>🏪 Vending Machine</h1>
          <p className="subtitle">Enter the code displayed on the machine</p>

          <div className="code-input-wrapper">
            <input
              type="text"
              value={code}
              onChange={handleCodeChange}
              placeholder="ENTER CODE"
              maxLength="6"
              className="code-input"
              autoFocus
            />
          </div>

          {codeExpiresAt && (
            <CountdownTimer 
              expiresAt={codeExpiresAt} 
              onExpire={handleCodeExpire}
            />
          )}

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
  };

  const ProductSelectionScreen = () => {
    const getCartQuantity = useCallback((productId) => {
      const item = cart.find(item => item.id === productId);
      return item ? item.quantity : 0;
    }, [cart]);

    const handleSessionExpire = useCallback(() => {
      alert('⏰ Session expired! Please generate a new code.');
      handleLogout();
    }, [handleLogout]);

    const handleExitClick = useCallback(() => {
      const confirmExit = window.confirm(
        '⚠️ Are you sure you want to exit?\n\nYour cart will be cleared and the session will be cancelled.'
      );
      if (confirmExit) {
        handleLogout();
      }
    }, [handleLogout]);

    return (
      <div className="screen">
        <div className="container">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <h1 style={{margin: 0}}>Select Your Products</h1>
            <button 
              onClick={handleExitClick}
              className="logout-btn-small"
            >
              ← Exit
            </button>
          </div>
          
          <p className="subtitle">Machine: {machineId} | Code: {code}</p>

          {sessionExpiresAt && (
            <CountdownTimer 
              expiresAt={sessionExpiresAt} 
              onExpire={handleSessionExpire}
            />
          )}

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
                {loading ? 'Processing...' : `Pay ₹${getTotalPrice().toFixed(2)} with Razorpay →`}
              </button>
              <div className="payment-methods">
                <p>💳 Secure payment via Razorpay</p>
                <div style={{display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '5px', fontSize: '12px'}}>
                  <span>💳 Cards</span>
                  <span>📱 UPI</span>
                  <span>🏦 Net Banking</span>
                  <span>💰 Wallets</span>
                </div>
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
            <span className="receipt-value">₹{receipt?.subtotal.toFixed(2)}</span>
          </div>

          {receipt?.couponUsed && (
            <div className="receipt-row" style={{color: '#4caf50'}}>
              <span>Coupon ({receipt.couponUsed}):</span>
              <span className="receipt-value">-₹{receipt.couponDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="receipt-row receipt-total">
            <span>Total Paid:</span>
            <span>₹{receipt?.totalAmount.toFixed(2)}</span>
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

  // ============ MAIN RENDER ============
  return (
    <div className="app">
      {showAdmin ? (
        <Admin onLogout={handleAdminLogout} />
      ) : (
        <>
          {step === 'code-entry' && <CodeEntryScreen />}
          {step === 'product-selection' && <ProductSelectionScreen />}
          {step === 'receipt' && <ReceiptScreen />}
        </>
      )}
    </div>
  );
}

export default App;
