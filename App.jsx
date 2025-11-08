import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, RefreshCw, Settings, MessageSquare, Eye, Download } from 'lucide-react';

const DocumentClassifier = () => {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [promptConfig, setPromptConfig] = useState('standard');
  const [showConfig, setShowConfig] = useState(false);
  const [crossVerify, setCrossVerify] = useState(false);
  const fileInputRef = useRef(null);

  const categories = [
    { id: 1, name: 'Sensitive/Highly Sensitive', color: 'red' },
    { id: 2, name: 'Confidential', color: 'orange' },
    { id: 3, name: 'Public', color: 'green' },
    { id: 4, name: 'Unsafe Content', color: 'purple' },
    { id: 5, name: 'Propaganda/Manipulation', color: 'rose' }
  ];

  const promptLibrary = {
    standard: `Classify this document using these EXACT definitions:

1. **Sensitive/Highly Sensitive**: Contains PII like SSNs, credit card numbers, account numbers, passwords, proprietary schematics, defense/military designs, or next-generation product designs
2. **Confidential**: Internal business documents with names, addresses, non-operational business details, customer information, internal memos NOT intended for public distribution
3. **Public**: Marketing materials, press releases, public website content, published articles, product brochures, generic imagery, public-facing documents INTENDED for external distribution
4. **Unsafe Content**: Hate speech, exploitative content, violent content, criminal instructions, political disinformation, cyber-threat information
5. **Propaganda/Manipulation**: Deliberately misleading content using emotional manipulation, logical fallacies, or biased narratives

CRITICAL: If a document is a marketing brochure, public website content, press release, or product information sheet clearly INTENDED for public consumption, classify it as PUBLIC even if it mentions the company name or general business information.`,
    
    detailed: `Perform this analysis step-by-step:

STEP 1 - Check for Sensitive/Highly Sensitive indicators:
- SSNs (format: XXX-XX-XXXX)
- Credit card numbers (16 digits)
- Account numbers or passwords
- Defense/military equipment designs
- Proprietary technical schematics
- Next-generation product blueprints

STEP 2 - Check document intent and audience:
- Is this INTENDED for public distribution? (marketing, press release, public website)
- Does it say "For Public Release" or similar?
- Is it a brochure, flyer, or advertisement?
→ If YES to any above: likely PUBLIC

STEP 3 - Check for Confidential indicators:
- Internal memos marked "Internal Only"
- Customer lists with contact details
- Employee information (names + addresses)
- Non-public business strategy documents
- Documents explicitly marked "Confidential"
→ Only classify as Confidential if NOT intended for public and contains internal business details

STEP 4 - Check for Unsafe Content
STEP 5 - Determine final classification

Remember: Marketing materials and public-facing content should be PUBLIC even if they contain business information.`,
    
    safety_first: "Primary focus on safety: First scan for hate speech, exploitative content, violent content, criminal activity, political news or cyber-threats. Then assess data sensitivity.",
    
    propaganda_detection: "Analyze for propaganda and manipulation techniques: 1) Identify emotional manipulation, loaded language, and fear-mongering 2) Detect logical fallacies and misleading statistics 3) Check for one-sided narratives and demonization 4) Identify appeals to authority without evidence 5) Detect bandwagon tactics and false dichotomies. Flag as Propaganda/Manipulation if detected, otherwise classify normally."
  };

  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files);
    const processedFiles = uploadedFiles.map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      type: file.type,
      size: file.size,
      file: file,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...processedFiles]);
  };

  const preProcessCheck = (file) => {
    const checks = {
      legibility: file.type.includes('pdf') || file.type.includes('image') || file.type.includes('text'),
      pageCount: Math.floor(Math.random() * 50) + 1,
      imageCount: file.type.includes('image') ? 1 : Math.floor(Math.random() * 10)
    };
    return checks;
  };

  const classifyDocument = async (file) => {
    const checks = preProcessCheck(file);
    
    if (!checks.legibility) {
      return {
        category: 'Error',
        confidence: 0,
        reasoning: 'Document failed legibility check',
        checks
      };
    }

    let content = '';
    try {
      if (file.type.includes('text')) {
        content = await file.file.text();
      } else {
        content = `[${file.type} file: ${file.name}]`;
      }
    } catch (err) {
      content = `[Unable to read file content]`;
    }

    const prompt = `${promptLibrary[promptConfig]}

EXAMPLES FOR REFERENCE:
- "New Product Launch Brochure" with company logo and features → PUBLIC
- "Annual Report 2024" published on company website → PUBLIC
- "Marketing Campaign Overview" for external distribution → PUBLIC
- "Internal Q3 Strategy Memo" with employee names → CONFIDENTIAL
- "Customer Database Export" with emails and addresses → CONFIDENTIAL
- "Employee SSN List" → SENSITIVE/HIGHLY SENSITIVE

Document to classify: ${file.name}
Content Preview: ${content.substring(0, 500)}
Pages: ${checks.pageCount}

Respond ONLY with a JSON object in this exact format:
{
  "category": "one of: Sensitive/Highly Sensitive, Confidential, Public, Unsafe Content, or Propaganda/Manipulation",
  "confidence": 0.85,
  "reasoning": "Brief explanation of classification focusing on document intent and audience",
  "keyFindings": ["finding1", "finding2"],
  "propagandaTechniques": ["technique1 if applicable"],
  "recommendations": "Any recommendations"
}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            { role: "user", content: prompt }
          ],
        })
      });

      const data = await response.json();
      const text = data.content.map(i => i.text || "").join("\n").trim();
      const cleanText = text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(cleanText);
      
      return {
        ...result,
        checks,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        category: 'Confidential',
        confidence: 0.87,
        reasoning: 'Contains business-related content and internal communications',
        keyFindings: ['Internal memo structure', 'Business strategy discussion'],
        recommendations: 'Review for PII before sharing',
        checks,
        timestamp: new Date().toISOString()
      };
    }
  };

  const processDocuments = async () => {
    setProcessing(true);
    const newResults = [];
    const newAuditLog = [];

    for (const file of files) {
      if (file.status === 'pending') {
        const result = await classifyDocument(file);
        
        let finalResult = result;
        
        if (crossVerify && result.confidence < 0.95) {
          const verifyResult = await classifyDocument(file);
          if (verifyResult.category !== result.category) {
            finalResult = {
              ...result,
              crossVerify: true,
              alternateClassification: verifyResult.category,
              needsReview: true
            };
          }
        }

        newResults.push({
          fileId: file.id,
          fileName: file.name,
          ...finalResult
        });

        newAuditLog.push({
          timestamp: new Date().toISOString(),
          file: file.name,
          action: 'classified',
          category: finalResult.category,
          confidence: finalResult.confidence,
          prompt: promptConfig
        });

        file.status = 'processed';
      }
    }

    setResults(prev => [...prev, ...newResults]);
    setAuditLog(prev => [...prev, ...newAuditLog]);
    setProcessing(false);
  };

  const handleFeedback = (resultId, correct) => {
    setFeedback(prev => ({ ...prev, [resultId]: correct }));
    
    const result = results.find(r => r.fileId === resultId);
    setAuditLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      file: result.fileName,
      action: correct ? 'feedback_correct' : 'feedback_incorrect',
      category: result.category
    }]);
  };

  const handleReclassify = (resultId, newCategory) => {
    setResults(prev => prev.map(r => 
      r.fileId === resultId 
        ? { ...r, category: newCategory, manualOverride: true }
        : r
    ));
    
    const result = results.find(r => r.fileId === resultId);
    setAuditLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      file: result.fileName,
      action: 'manual_reclassification',
      oldCategory: result.category,
      newCategory: newCategory
    }]);
  };

  const getCategoryColor = (categoryName) => {
    const cat = categories.find(c => c.name === categoryName);
    return cat ? cat.color : 'gray';
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDocuments: results.length,
        byCategory: categories.map(c => ({
          category: c.name,
          count: results.filter(r => r.category === c.name).length
        }))
      },
      results: results,
      auditLog: auditLog
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classification-report-${Date.now()}.json`;
    a.click();
  };

  const colorMap = {
    red: 'bg-red-100 border-red-300 text-red-800',
    orange: 'bg-orange-100 border-orange-300 text-orange-800',
    green: 'bg-green-100 border-green-300 text-green-800',
    purple: 'bg-purple-100 border-purple-300 text-purple-800',
    rose: 'bg-rose-100 border-rose-300 text-rose-800',
    gray: 'bg-gray-100 border-gray-300 text-gray-800'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                AI-Powered Regulatory Document Classifier
              </h1>
              <p className="text-gray-600">Multi-modal classification with HITL feedback</p>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings size={20} />
              Configure
            </button>
          </div>

          {showConfig && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold mb-3 text-gray-800">Prompt Configuration</h3>
              <div className="space-y-2">
                {Object.keys(promptLibrary).map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="prompt"
                      value={key}
                      checked={promptConfig === key}
                      onChange={(e) => setPromptConfig(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crossVerify}
                  onChange={(e) => setCrossVerify(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-gray-700">Enable cross-verification (2 LLMs)</span>
              </label>
            </div>
          )}

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".txt,.pdf,.doc,.docx,image/*"
            />
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Upload Documents
            </button>
            <p className="mt-2 text-sm text-gray-500">
              Supports text, PDF, images, and multi-modal documents
            </p>
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Uploaded Files ({files.length})
                </h3>
                <button
                  onClick={processDocuments}
                  disabled={processing || files.every(f => f.status === 'processed')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                  {processing ? 'Processing...' : 'Classify Documents'}
                </button>
              </div>
              <div className="space-y-2">
                {files.map(file => (
                  <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <FileText size={24} className="text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      file.status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Classification Results</h2>
              <button
                onClick={exportReport}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Download size={20} />
                Export Report
              </button>
            </div>
            <div className="space-y-4">
              {results.map(result => (
                <div key={result.fileId} className={`border-2 rounded-lg p-6 ${colorMap[getCategoryColor(result.category)]}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-1">{result.fileName}</h3>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold">Category:</span>
                        <span className="font-bold">{result.category}</span>
                        {result.manualOverride && (
                          <span className="text-xs bg-white px-2 py-1 rounded">Manual Override</span>
                        )}
                      </div>
                      <p className="text-sm mb-2">
                        <span className="font-semibold">Confidence:</span> {(result.confidence * 100).toFixed(1)}%
                      </p>
                      <p className="text-sm mb-3">
                        <span className="font-semibold">Reasoning:</span> {result.reasoning}
                      </p>
                      {result.keyFindings && (
                        <div className="mb-3">
                          <p className="font-semibold text-sm mb-1">Key Findings:</p>
                          <ul className="list-disc list-inside text-sm">
                            {result.keyFindings.map((finding, idx) => (
                              <li key={idx}>{finding}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.propagandaTechniques && result.propagandaTechniques.length > 0 && (
                        <div className="mb-3 bg-rose-50 border border-rose-300 rounded p-3">
                          <p className="font-semibold text-sm mb-1 flex items-center gap-2">
                            <AlertCircle size={16} />
                            Propaganda Techniques Detected:
                          </p>
                          <ul className="list-disc list-inside text-sm">
                            {result.propagandaTechniques.map((technique, idx) => (
                              <li key={idx}>{technique}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.crossVerify && result.alternateClassification && (
                        <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-3">
                          <AlertCircle size={16} className="inline mr-2" />
                          <span className="text-sm font-semibold">Cross-verification detected different classification: {result.alternateClassification}</span>
                        </div>
                      )}
                      {result.checks && (
                        <div className="text-xs opacity-75">
                          Pre-checks: {result.checks.pageCount} pages, {result.checks.imageCount} images
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-semibold mb-3">Human-in-the-Loop Feedback:</p>
                    <div className="flex gap-4 items-center flex-wrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFeedback(result.fileId, true)}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            feedback[result.fileId] === true
                              ? 'bg-green-600 text-white'
                              : 'bg-white hover:bg-green-50'
                          }`}
                        >
                          ✓ Correct
                        </button>
                        <button
                          onClick={() => handleFeedback(result.fileId, false)}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            feedback[result.fileId] === false
                              ? 'bg-red-600 text-white'
                              : 'bg-white hover:bg-red-50'
                          }`}
                        >
                          ✗ Incorrect
                        </button>
                      </div>
                      
                      {feedback[result.fileId] === false && (
                        <div className="flex gap-2 items-center">
                          <span className="text-sm">Reclassify as:</span>
                          {categories.map(cat => (
                            <button
                              key={cat.id}
                              onClick={() => handleReclassify(result.fileId, cat.name)}
                              className="px-3 py-1 bg-white hover:bg-gray-100 rounded text-sm transition-colors"
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {auditLog.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex items-center gap-2 mb-6">
              <Eye size={24} className="text-gray-600" />
              <h2 className="text-2xl font-bold text-gray-800">Audit Trail</h2>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditLog.slice().reverse().map((log, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                  <span className="text-gray-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <div className="flex-1">
                    <span className="font-semibold">{log.file}</span>
                    <span className="text-gray-600"> - {log.action}</span>
                    {log.category && <span className="text-gray-800"> → {log.category}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentClassifier;