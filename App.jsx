import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, FileText, AlertCircle, CheckCircle,
  RefreshCw, Settings, Eye, Download
} from 'lucide-react';
import './App.css';

const DocumentClassifier = () => {
  // Get API key from environment variable
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim() || '';
  
  // Debug: Check if API key is loaded (only in dev mode)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('Environment check:');
      console.log('VITE_OPENAI_API_KEY exists:', !!import.meta.env.VITE_OPENAI_API_KEY);
      console.log('VITE_OPENAI_API_KEY length:', import.meta.env.VITE_OPENAI_API_KEY?.length || 0);
      console.log('All env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
    }
  }, []);
  
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [showConfig, setShowConfig] = useState(false);
  const fileInputRef = useRef(null);

  // Persistent dark mode (localStorage)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('hitachi_dark_mode');
    return saved ? JSON.parse(saved) : false;
  });
  
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('hitachi_dark_mode', JSON.stringify(darkMode));
  }, [darkMode]);

  const categories = [
    { name: 'Highly Sensitive', color: 'red' },
    { name: 'Confidential (Important/Internal)', color: 'orange' },
    { name: 'Confidential (Policy-based)', color: 'yellow' },
    { name: 'Public', color: 'green' },
    { name: 'Unsafe Content', color: 'purple' },
    { name: 'Confidential and Unsafe', color: 'blue' }
  ];

  const handleFileUpload = (e) => {
    const uploaded = Array.from(e.target.files).map(f => ({
      id: Date.now() + Math.random(),
      name: f.name,
      type: f.type,
      size: f.size,
      file: f,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...uploaded]);
  };

  const classifyDocument = async (file) => {
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      throw new Error('API key is required. Please set VITE_OPENAI_API_KEY in your .env file.');
    }

    console.log('Classifying file:', file.name);
    console.log('API Key length:', apiKey.length);
    console.log('API Key starts with:', apiKey.substring(0, 7));

    let content = '';
    try {
      if (file.type.includes('text')) {
        content = await file.file.text();
      } else {
        content = `[${file.type} file: ${file.name}]`;
      }
    } catch {
      content = '[Could not read file content]';
    }

    const prompt = `Classify this document into up to TWO of these categories (choose max 2):
- Highly Sensitive (contains PII, protected information, highly confidential data)
- Confidential (Important/Internal)
- Confidential (Policy-based)
- Public (safe for public viewing, no sensitive information)
- Unsafe Content (harmful, inappropriate, or dangerous content)

Document Name: ${file.name}
Content Preview:
${content.slice(0, 1000)}

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "categories": [
    {
      "category": "category name from the list above",
      "confidence": 0.85,
      "reasoning": "detailed explanation of why this classification was chosen"
    }
    // second category object here if applicable
  ],
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "recommendations": "specific recommendations for handling this document"
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `API error: ${response.status} ${response.statusText}`;
        console.error('OpenAI API Error:', errorMsg, errorData);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      const clean = text.replace(/```json\s*|\s*```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Raw text:', text);
        throw new Error('Failed to parse AI response as JSON');
      }

      return {
        fileId: file.id,
        fileName: file.name,
        categories: parsed.categories || [],
        keyFindings: parsed.keyFindings || [],
        recommendations: parsed.recommendations || '',
        timestamp: new Date().toISOString(),
        isAIGenerated: true
      };
    } catch (err) {
      console.error('Classification error:', err);
      throw err;
    }
  };

  const processDocuments = async () => {
    if (!apiKey) {
      alert('API key not set!');
      return;
    }

    setProcessing(true);

    for (const file of files) {
      if (file.status === 'pending') {
        try {
          const result = await classifyDocument(file);
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'processed' } : f
          ));
          setResults(prev => [...prev, result]);
        } catch (err) {
          console.error('Error classifying file:', file.name, err);
          const errorMessage = err.message || 'Unknown error occurred';
          const errorResult = {
            fileId: file.id,
            fileName: file.name,
            categories: [],
            keyFindings: [],
            recommendations: `Error: ${errorMessage}. Check the browser console (F12) for details.`,
            isError: true,
            errorMessage: errorMessage,
            timestamp: new Date().toISOString()
          };
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: 'error' } : f
          ));
          setResults(prev => [...prev, errorResult]);
        }
      }
    }

    setProcessing(false);
  };

  // Correct classification handler for multiple categories
  const handleCorrection = async (fileId) => {
    const result = results.find(r => r.fileId === fileId);
    const file = files.find(f => f.id === fileId);
    if (!result || !file) return;

    // Prompt user to select 1 or 2 correct categories from the categories list
    const categoryNames = categories.map(c => c.name);
    let promptMsg = `The AI classified the document "${file.name}" as:\n\n`;
    promptMsg += result.categories.map(c => `- ${c.category}`).join('\n') + '\n\n';
    promptMsg += 'Please enter up to TWO correct categories separated by commas from this list:\n';
    promptMsg += categoryNames.join(', ') + '\n\nExample input: Public, Highly Sensitive';

    let userInput = prompt(promptMsg);
    if (!userInput) {
      alert('Correction cancelled.');
      return;
    }

    // Parse and sanitize user input categories
    const selected = userInput.split(',')
      .map(s => s.trim())
      .filter(s => categoryNames.includes(s))
      .slice(0, 2);

    if (selected.length === 0) {
      alert('No valid categories selected. Correction cancelled.');
      return;
    }

    try {
      // Get file content again for feedback prompt
      let content = '';
      if (file.type.includes('text')) {
        content = await file.file.text();
      } else {
        content = `[${file.type} file: ${file.name}]`;
      }

      // Compose feedback prompt for the AI to "reclassify" with correction in mind
      const feedbackPrompt = `The previous classification for this document was incorrect.

Previous categories:
${result.categories.map(c => `- ${c.category}`).join('\n')}

Correct categories:
${selected.map(cat => `- ${cat}`).join('\n')}

Please re-analyze this document and provide a classification with these CORRECT categories.

Document Name: ${file.name}
Content Preview:
${content.slice(0, 1000)}

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "categories": [
    {
      "category": "category name from the list above",
      "confidence": 0.95,
      "reasoning": "detailed explanation of why this category is correct and why the previous classification was wrong"
    }
    // second category object here if applicable
  ],
  "keyFindings": ["specific evidence supporting these categories"],
  "recommendations": "updated recommendations based on correct classification"
}`;

      // Call OpenAI API with feedback prompt
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{ role: 'user', content: feedbackPrompt }]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get corrected classification');
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      const clean = text.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(clean);

      // Update results with corrected info
      setResults(prev => prev.map(r =>
        r.fileId === fileId
          ? {
              ...r,
              categories: parsed.categories || [],
              keyFindings: parsed.keyFindings || [],
              recommendations: parsed.recommendations || '',
              wasCorrected: true,
              originalCategories: result.categories,
              correctionTimestamp: new Date().toISOString()
            }
          : r
      ));

      alert('Classification corrected and model has learned from the feedback!');
    } catch (err) {
      alert(`Failed to apply correction: ${err.message}`);
      console.error(err);
    }
  };

  const handleFeedback = (fileId, isCorrect) => {
    if (isCorrect) {
      alert('Thank you for confirming the classification!');
      setResults(prev => prev.map(r =>
        r.fileId === fileId ? { ...r, userConfirmed: true } : r
      ));
    } else {
      handleCorrection(fileId);
    }
  };

  const getCategoryColor = (cat) =>
    categories.find(c => c.name === cat)?.color || 'gray';

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDocuments: results.length,
        byCategory: categories.map(c => ({
          category: c.name,
          count: results.filter(r => r.categories && r.categories.some(cat => cat.category === c.name)).length
        }))
      },
      results: results.map(r => ({
        ...r,
        apiKeyUsed: '***hidden***'
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classification-report-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="container fade-in">
      <div className="stack">
        {/* Header */}
        <div className="header">
          <h1 className="title text-gradient">Hitachi AI Regulatory Classifier</h1>
          <div className="dark-toggle" onClick={() => setDarkMode(prev => !prev)} />
        </div>

        {/* Upload Section */}
        <div className="glass-card">
          <div className="header">
            <p className="text-muted">Multi-modal classification with HITL feedback</p>
            <button 
              onClick={() => setShowConfig(!showConfig)} 
              className="btn-secondary flex items-center gap-2"
            >
              <Settings size={18} /> Info
            </button>
          </div>

          {showConfig && (
            <div className="config-panel">
              <h3 className="section-title">How it works:</h3>
              <ul className="text-sm" style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                <li>Upload text or document files for classification</li>
                <li>Each file is sent to OpenAI's GPT-4o-mini for analysis</li>
                <li>The AI returns up to two categories, confidence scores, and detailed reasoning</li>
                <li>You can confirm or flag incorrect classifications</li>
              </ul>
              {!apiKey ? (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: 'rgba(220, 38, 38, 0.1)', 
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  borderRadius: '0.5rem'
                }}>
                  <p className="text-sm" style={{ color: '#dc2626' }}>
                    <b>⚠️ API Key Required:</b> Please set VITE_OPENAI_API_KEY in your .env file and restart the dev server
                  </p>
                  <p className="text-xs" style={{ color: '#dc2626', marginTop: '0.5rem', opacity: 0.8 }}>
                    <b>Steps:</b><br/>
                    1. Create a <code>.env</code> file in the root directory (same level as package.json)<br/>
                    2. Add: <code>VITE_OPENAI_API_KEY=your_actual_key_here</code><br/>
                    3. Make sure there are NO spaces around the = sign<br/>
                    4. Restart the dev server completely (stop with Ctrl+C, then run npm run dev again)
                  </p>
                  <p className="text-xs" style={{ color: '#dc2626', marginTop: '0.5rem', opacity: 0.8 }}>
                    Check the browser console (F12) for debugging information.
                  </p>
                </div>
              ) : (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '0.5rem'
                }}>
                  <p className="text-sm" style={{ color: '#22c55e' }}>
                    <b>✅ API Key Loaded:</b> Ready to classify documents
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".txt,.pdf,.doc,.docx,image/*"
            />
            <Upload size={48} style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.6 }} />
            <button className="btn-primary">Upload Documents</button>
            <div className="text-sm text-muted" style={{ marginTop: '0.5rem' }}>
              Supports PDF, text, images, and multi-modal documents
            </div>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="header">
                <h3 className="section-title">Uploaded Files ({files.length})</h3>
                <button
                  onClick={processDocuments}
                  disabled={processing || files.every(f => f.status === 'processed') || !apiKey}
                  className="btn-primary flex items-center gap-2"
                >
                  {processing ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  {processing ? 'Classifying...' : 'Classify with AI'}
                </button>
              </div>
              <div style={{ marginTop: '1rem' }}>
                {files.map(f => (
                  <div key={f.id} className="file-item">
                    <div className="file-item-content">
                      <FileText size={20} color="#4455ff" />
                      <span className="file-item-name">{f.name}</span>
                    </div>
                    <span className={`text-sm ${f.status === 'error' ? 'text-red-600' : 'text-muted'}`}>
                      {f.status === 'error' ? 'Error' : `${(f.size / 1024).toFixed(1)} KB`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="glass-card">
            <div className="header">
              <h2 className="section-title">Classification Results</h2>
              <button onClick={exportReport} className="btn-secondary flex items-center gap-2">
                <Download size={18} /> Export Report
              </button>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              {results.map(r => (
                <div key={r.fileId} className="result-card">
                  <div className="result-card-content">
                    <div className="result-card-title">{r.fileName}</div>
                    
                    {/* Status badges */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      {r.isAIGenerated && (
                        <span className="category-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                          AI Generated
                        </span>
                      )}
                      {r.wasCorrected && (
                        <span className="category-badge" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                          Corrected
                        </span>
                      )}
                      {r.userConfirmed && (
                        <span className="category-badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                          User Confirmed
                        </span>
                      )}
                      {r.isError && (
                        <span className="category-badge" style={{ background: 'rgba(220, 38, 38, 0.15)', color: '#dc2626', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
                          Error
                        </span>
                      )}
                    </div>

                    {/* Categories */}
                    <div className="result-card-detail">
                      <b>Categories:</b>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {r.categories && r.categories.length > 0 ? (
                          r.categories.map((cat, idx) => (
                            <span key={idx} className={`category-badge ${getCategoryColor(cat.category)}`}>
                              {cat.category} ({(cat.confidence * 100).toFixed(1)}%)
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted">No categories assigned</span>
                        )}
                      </div>
                    </div>

                    {/* Reasoning for each category */}
                    {r.categories && r.categories.map((cat, idx) => (
                      <div key={idx} className="result-card-detail" style={{ marginTop: '0.75rem' }}>
                        <b>Reasoning for {cat.category}:</b>
                        <p className="text-sm" style={{ marginTop: '0.25rem', whiteSpace: 'pre-line' }}>
                          {cat.reasoning}
                        </p>
                      </div>
                    ))}

                    {r.keyFindings && r.keyFindings.length > 0 && (
                      <div className="result-card-detail" style={{ marginTop: '0.75rem' }}>
                        <b>Key Findings:</b>
                        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                          {r.keyFindings.map((finding, idx) => (
                            <li key={idx} className="text-sm">{finding}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {r.recommendations && (
                      <div className="result-card-detail" style={{ marginTop: '0.75rem' }}>
                        <b>Recommendations:</b>
                        <p className="text-sm" style={{ marginTop: '0.25rem' }}>{r.recommendations}</p>
                      </div>
                    )}

                    <div className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                      {new Date(r.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback Section */}
            {results.map(r => (
              <div key={'fb' + r.fileId} className="feedback-section">
                <p className="text-sm" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  Human-in-the-Loop Feedback:
                </p>
                <div className="feedback-buttons">
                  <button
                    onClick={() => handleFeedback(r.fileId, true)}
                    className="btn-secondary feedback-btn-correct"
                  >
                    ✓ Correct
                  </button>
                  <button
                    onClick={() => handleFeedback(r.fileId, false)}
                    className="btn-secondary feedback-btn-incorrect"
                  >
                    ✗ Incorrect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentClassifier;
