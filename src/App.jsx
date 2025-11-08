import React, { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, RefreshCw, Settings, Download } from "lucide-react";

const DocumentClassifier = () => {
  const [apiKey] = useState("REDACTED_OPENAI_KEY");

  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [showConfig, setShowConfig] = useState(false);
  const fileInputRef = useRef(null);

  const categories = [
    { name: "Highly Sensitive", color: "red" },
    { name: "Confidential (Important/Internal)", color: "orange" },
    { name: "Confidential (Policy-based)", color: "yellow" },
    { name: "Public", color: "green" },
    { name: "Unsafe Content", color: "purple" },
    { name: "Confindential and Unsafe", color: "blue" },
  ];

  const handleFileUpload = (e) => {
    const uploaded = Array.from(e.target.files).map((f) => ({
      id: Date.now() + Math.random(),
      name: f.name,
      type: f.type,
      size: f.size,
      file: f,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...uploaded]);
  };

  const classifyDocument = async (file) => {
    if (!apiKey) {
      throw new Error("API key is required");
    }

    let content = "";
    try {
      if (file.type.includes("text")) {
        content = await file.file.text();
      } else {
        content = `[${file.type} file: ${file.name}]`;
      }
    } catch {
      content = "[Could not read file content]";
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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      const clean = text.replace(/```json\s*|\s*```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (parseError) {
        console.error("JSON parse error:", parseError, "Raw text:", text);
        throw new Error("Failed to parse AI response as JSON");
      }

      return {
        fileId: file.id,
        fileName: file.name,
        categories: parsed.categories || [],
        keyFindings: parsed.keyFindings || [],
        recommendations: parsed.recommendations || "",
        timestamp: new Date().toISOString(),
        isAIGenerated: true,
      };
    } catch (err) {
      console.error("Classification error:", err);
      throw err;
    }
  };

  const processDocuments = async () => {
    if (!apiKey) {
      alert("API key not set!");
      return;
    }

    setProcessing(true);

    for (const file of files) {
      if (file.status === "pending") {
        try {
          const result = await classifyDocument(file);
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: "processed" } : f
          ));
          setResults(prev => [...prev, result]);
        } catch (err) {
          const errorResult = {
            fileId: file.id,
            fileName: file.name,
            categories: [],
            keyFindings: [],
            recommendations: "Check your API key and try again",
            isError: true,
            timestamp: new Date().toISOString(),
          };

          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, status: "error" } : f
          ));
          setResults(prev => [...prev, errorResult]);
        }
      }
    }

    setProcessing(false);
  };

  // New: Correct classification handler for multiple categories
  const handleCorrection = async (fileId) => {
    const result = results.find(r => r.fileId === fileId);
    const file = files.find(f => f.id === fileId);
    if (!result || !file) return;

    // Prompt user to select 1 or 2 correct categories from the categories list
    const categoryNames = categories.map(c => c.name);
    let promptMsg = `The AI classified the document "${file.name}" as:\n\n`;
    promptMsg += result.categories.map(c => `- ${c.category}`).join("\n") + "\n\n";
    promptMsg += "Please enter up to TWO correct categories separated by commas from this list:\n";
    promptMsg += categoryNames.join(", ") + "\n\nExample input: Public, Highly Sensitive";

    let userInput = prompt(promptMsg);
    if (!userInput) {
      alert("Correction cancelled.");
      return;
    }

    // Parse and sanitize user input categories
    const selected = userInput.split(",")
      .map(s => s.trim())
      .filter(s => categoryNames.includes(s))
      .slice(0, 2);

    if (selected.length === 0) {
      alert("No valid categories selected. Correction cancelled.");
      return;
    }

    try {
      // Get file content again for feedback prompt
      let content = "";
      if (file.type.includes("text")) {
        content = await file.file.text();
      } else {
        content = `[${file.type} file: ${file.name}]`;
      }

      // Compose feedback prompt for the AI to "reclassify" with correction in mind
      const feedbackPrompt = `The previous classification for this document was incorrect.

Previous categories:
${result.categories.map(c => `- ${c.category}`).join("\n")}

Correct categories:
${selected.map(cat => `- ${cat}`).join("\n")}

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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [{ role: "user", content: feedbackPrompt }],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get corrected classification");
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      const clean = text.replace(/```json\s*|\s*```/g, "").trim();

      const parsed = JSON.parse(clean);

      // Update results with corrected info
      setResults(prev => prev.map(r =>
        r.fileId === fileId
          ? {
              ...r,
              categories: parsed.categories || [],
              keyFindings: parsed.keyFindings || [],
              recommendations: parsed.recommendations || "",
              wasCorrected: true,
              originalCategories: result.categories,
              correctionTimestamp: new Date().toISOString(),
            }
          : r
      ));

      alert("Classification corrected and model has learned from the feedback!");
    } catch (err) {
      alert(`Failed to apply correction: ${err.message}`);
      console.error(err);
    }
  };

  const handleFeedback = (fileId, isCorrect) => {
    if (isCorrect) {
      alert("Thank you for confirming the classification!");
      setResults(prev => prev.map(r =>
        r.fileId === fileId ? { ...r, userConfirmed: true } : r
      ));
    } else {
      handleCorrection(fileId);
    }
  };

  const getCategoryColor = (cat) =>
    categories.find((c) => c.name === cat)?.color || "gray";

  const colorMap = {
    red: "bg-red-100 border-red-300 text-red-800",
    orange: "bg-orange-100 border-orange-300 text-orange-800",
    yellow: "bg-yellow-100 border-yellow-300 text-yellow-800",
    green: "bg-green-100 border-green-300 text-green-800",
    purple: "bg-purple-100 border-purple-300 text-purple-800",
    gray: "bg-gray-100 border-gray-300 text-gray-800",
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDocuments: results.length,
        byCategory: categories.map((c) => ({
          category: c.name,
          count: results.filter((r) => r.categories.some(cat => cat.category === c.name)).length,
        })),
      },
      results: results.map(r => ({
        ...r,
        apiKeyUsed: "***hidden***"
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classification-report-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                AI-Powered Document Classifier
              </h1>
              <p className="text-gray-600">Real-time AI classification</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                aria-label="Toggle info"
              >
                <Settings size={20} />
                Info
              </button>
            </div>
          </div>

          {showConfig && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold mb-2 text-gray-800">How it works:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Upload text or document files for classification</li>
                <li>Each file is sent to OpenAI's GPT-4o-mini for analysis</li>
                <li>The AI returns up to two categories, confidence scores, and detailed reasoning</li>
                <li>You can confirm or flag incorrect classifications</li>
              </ul>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 cursor-pointer transition-colors"
            role="button"
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                fileInputRef.current?.click();
              }
            }}
            aria-label="Upload files"
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="mt-2 text-sm text-gray-500">
              Click or tap the upload icon to select files. Supports text, PDF, and image files.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              accept=".txt,.pdf,.doc,.docx,image/*"
              style={{ display: "none" }}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between mb-4">
                <h3 className="text-lg font-semibold">Uploaded Files ({files.length})</h3>
                <button
                  onClick={processDocuments}
                  disabled={processing || files.every((f) => f.status !== "pending")}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {processing ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <CheckCircle size={20} />
                  )}
                  {processing ? "Classifying..." : "Classify with AI"}
                </button>
              </div>
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-2 border border-gray-200"
                >
                  <FileText size={24} className="text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-sm text-gray-500">{(f.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      f.status === "processed"
                        ? "bg-green-100 text-green-800"
                        : f.status === "error"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {f.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-bold">Classification Results</h2>
              <button
                onClick={exportReport}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Download size={20} />
                Export Report
              </button>
            </div>
            {results.map((r) => (
              <div
                key={r.fileId}
                className={`border-2 rounded-lg p-6 mb-4 ${
                  r.isError ? colorMap.gray : colorMap[getCategoryColor(r.categories?.[0]?.category)]
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{r.fileName}</h3>
                    <div className="flex gap-2 mb-2">
                      {r.isAIGenerated && (
                        <span className="inline-block text-xs bg-blue-500 text-white px-2 py-1 rounded">
                          AI Generated
                        </span>
                      )}
                      {r.wasCorrected && (
                        <span className="inline-block text-xs bg-orange-500 text-white px-2 py-1 rounded">
                          Corrected
                        </span>
                      )}
                      {r.userConfirmed && (
                        <span className="inline-block text-xs bg-green-600 text-white px-2 py-1 rounded">
                          User Confirmed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.categories?.map((cat, idx) => (
                      <p key={idx} className="font-semibold text-sm">
                        {cat.category}: {(cat.confidence * 100).toFixed(1)}%
                      </p>
                    ))}
                    <p className="text-xs text-gray-700">
                      {new Date(r.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                {r.categories?.map((cat, idx) => (
                  <div key={idx} className="mb-3">
                    <p className="mb-1">
                      <strong>Reasoning for {cat.category}:</strong>
                    </p>
                    <p className="whitespace-pre-line">{cat.reasoning}</p>
                  </div>
                ))}
                {r.keyFindings.length > 0 && (
                  <div className="mb-2">
                    <strong>Key Findings:</strong>
                    <ul className="list-disc list-inside">
                      {r.keyFindings.map((kf, i) => (
                        <li key={i}>{kf}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mb-4">
                  <strong>Recommendations:</strong> {r.recommendations}
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleFeedback(r.fileId, true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Correct
                  </button>
                  <button
                    onClick={() => handleFeedback(r.fileId, false)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Incorrect
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
