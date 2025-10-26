// src/TestMode.js - Test Code Generator for Web Testing
import React, { useState } from 'react';
import { database } from './firebase';
import { ref, update } from 'firebase/database';
import './TestMode.css';

function TestMode({ onCodeGenerated }) {
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);

  const generateTestCode = async () => {
    setLoading(true);
    
    // Generate random 6-character code
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    try {
      // Save to Firebase
      const currentTime = Math.floor(Date.now() / 1000);
      const expiryTime = currentTime + 300; // 5 minutes
      
      const sessionRef = ref(database, `sessions/${code}`);
      await update(sessionRef, {
        code: code,
        machineId: 'VEND001',
        status: 'active',
        createdAt: currentTime,
        expiresAt: expiryTime
      });
      
      setGeneratedCode(code);
      
      if (onCodeGenerated) {
        onCodeGenerated(code);
      }
      
    } catch (error) {
      console.error('Error generating test code:', error);
      alert('Failed to generate test code');
    }
    
    setLoading(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    alert('Code copied to clipboard!');
  };

  return (
    <div className="test-mode">
      <div className="test-mode-banner">
        ⚠️ TEST MODE - For Development Only
      </div>
      
      <div className="test-mode-content">
        <h3>🧪 Test Code Generator</h3>
        <p>Generate codes for testing without Raspberry Pi hardware</p>
        
        <button 
          onClick={generateTestCode}
          disabled={loading}
          className="generate-test-btn"
        >
          {loading ? 'Generating...' : '🎲 Generate Test Code'}
        </button>
        
        {generatedCode && (
          <div className="generated-code-display">
            <div className="code-box">
              <strong>Generated Code:</strong>
              <div className="code-value">{generatedCode}</div>
            </div>
            <button onClick={copyCode} className="copy-btn">
              📋 Copy Code
            </button>
            <p className="code-note">
              Code expires in 5 minutes. Use it on the main page to test the flow.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestMode;
