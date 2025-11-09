# Hitachi AI Regulatory Document Classifier

A modern, AI-powered document classification system with a beautiful glass morphism UI. Classifies documents into up to two categories using OpenAI's GPT-4o-mini.

## Features

- 🎨 Beautiful glass morphism UI with dark mode support
- 🤖 AI-powered classification using OpenAI GPT-4o-mini
- 📄 Support for multiple document types (PDF, text, images)
- 🏷️ Multi-category classification (up to 2 categories per document)
- ✅ Human-in-the-loop feedback system
- 📊 Audit trail for all classifications
- 📥 Export classification reports as JSON

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Create a `.env` file in the root directory:

```env
VITE_OPENAI_API_KEY=your_openai_api_key_here
```

Replace `your_openai_api_key_here` with your actual OpenAI API key.

**Note:** Make sure to add `.env` to your `.gitignore` file to keep your API key secure.

### 3. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Categories

The classifier supports the following categories:

1. **Highly Sensitive** - Contains PII, protected information, highly confidential data
2. **Confidential (Important/Internal)** - Internal documents requiring confidentiality
3. **Confidential (Policy-based)** - Documents classified based on policy requirements
4. **Public** - Safe for public viewing, no sensitive information
5. **Unsafe Content** - Harmful, inappropriate, or dangerous content
6. **Confidential and Unsafe** - Documents that are both confidential and unsafe

## Usage

1. **Upload Documents**: Click the upload area or drag and drop files
2. **Classify**: Click "Classify with AI" to process uploaded documents
3. **Review Results**: Each document can be classified into up to 2 categories
4. **Provide Feedback**: 
   - Click "Correct" if the classification is accurate
   - Click "Incorrect" to provide correction feedback (the AI will learn from your feedback)
5. **Export**: Download a JSON report of all classifications

## Features

### Human-in-the-Loop Feedback

When you mark a classification as incorrect, the system:
- Prompts you to select the correct categories
- Sends feedback to the AI to reclassify the document
- Updates the classification with improved reasoning
- Learns from your corrections

### Audit Trail

All actions are logged in the audit trail:
- Document classifications
- User feedback (correct/incorrect)
- Manual corrections
- Timestamps for all actions

### Export Reports

Export comprehensive JSON reports containing:
- Summary statistics by category
- All classification results
- Complete audit trail
- Timestamps and metadata

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **OpenAI GPT-4o-mini** - AI classification engine
- **Lucide React** - Icon library
- **Custom CSS** - Glass morphism design

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_OPENAI_API_KEY` | Your OpenAI API key | Yes |

## Build for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

## License

Private - Hitachi Project
