const express = require('express');
const app = express();
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const os = require("os"); // For temp directory
const { v4: uuidv4 } = require("uuid"); // For unique filenames
const { Groq } = require('groq-sdk');

require('dotenv').config();
const groq = new Groq({ apiKey: "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"});
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const vision = require('@google-cloud/vision');
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const PORT = process.env.PORT || 3000;
const apiKey = process.env.GEMINI_API;


const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);
let chatSession, chatSession2;

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

// Configure Multer for file storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//       cb(null, 'uploads/'); // Folder where files will be stored
//   },
//   filename: (req, file, cb) => {
//       cb(null, Date.now() + path.extname(file.originalname)); // Rename file with timestamp
//   }
// });

const storage =  multer.memoryStorage();

const upload = multer({ storage });



// Function to upload files to Gemini
async function uploadToGemini(filePath, mimeType) {
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: mimeType,
    displayName: filePath,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}


async function uploadToGeminiBuffer(Originalfile) {
  const buffer = Originalfile.buffer;
  const fileName = Originalfile.originalname.replace(/\s/g, "_");
  const mimeType = Originalfile.mimetype;

  // Generate a temporary file path
  const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}_${fileName}`);
  fs.writeFileSync(tempFilePath, buffer);
  // Create a readable stream from the buffer
console.log("hi");

try {
  // Upload the temporary file
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
    mimeType: mimeType,
    displayName: fileName,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
} catch (error) {
    console.error("Error during upload:", error);
    return null;
} finally {
  // Clean up the temporary file
    fs.unlinkSync(tempFilePath);
}
}

async function main(file) {
  // Create a transcription job
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(file), // Required path to audio file - replace with your audio file!
    model: "whisper-large-v3-turbo", // Required model to use for transcription
    prompt: "Specify context or spelling", // Optional
    response_format: "json", // Optional
    language: "en", // Optional
    temperature: 0.0, // Optional
  });
  // Log the transcribed text
  console.log(transcription.text);
  return transcription.text;
}

async function uploadAudio(Originalfile) {
  const buffer = Originalfile.buffer;
  const fileName = Originalfile.originalname.replace(/\s/g, "_");
  const mimeType = Originalfile.mimetype;
  const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}_${fileName}`);
  fs.writeFileSync(tempFilePath, buffer);
  const response = await main(tempFilePath);
  return response;





}

// Initialize AI chat session
async function initializeChatSession() {
  chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [
          {
            text: "You are a graduate student in the computer science department at a university. Help me understand CS topics. If I say hi, tell me new CS information. Otherwise, answer what I ask for.",
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: `Of course! Here are some CS topics:\n
            1. Algorithms and Data Structures\n
            2. Artificial Intelligence\n
            3. Computer Architecture\n
            4. Computer Graphics\n
            5. Computer Networks\n
            6. Cybersecurity\n
            7. Databases\n
            8. Human-Computer Interaction\n
            9. Operating Systems\n
            10. Programming Languages\n
            11. Software Engineering\n
            12. Theory of Computation\n
            13. Signal Processing\n
            14. Statistics\n
            15. Machine Learning\n\n
            Let me know if you'd like more information!`,
          },
        ],
      },
    ],
  });
}


// Middleware setup
const { query, validationResult, body } = require('express-validator');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const { log } = require('console');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

// Get response from the AI chat session
async function getResponse(message) {
  const result = await chatSession.sendMessage(message);
  return result.response.text();
}

// Process an image and get response from Gemini
async function getImageResponse(message, file) {
  // const file = await uploadToGemini(imagePath, "image/jpeg");
  const result = await model.generateContent([
    message,
    {
      fileData: {
        fileUri: file.uri,
        mimeType: file.mimeType,
      },
    },
  ]);
  console.log(result.response.text());
  return result.response.text();
}


// Routes
app.get('/test', async (req, res) => {
  const message = "See the image and say what's written in here";
  const file = await uploadToGemini("Screenshot.jpg", "image/jpeg");
  const response = await getImageResponse(message, file);
  // console.log(response);
  res.json({ response });
});

app.post('/ai', async (req, res) => {
  const message = req.body.message;
  const response = await getResponse(message);
  console.log(response);
  res.json({ response });
});

app.post('/video', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    req.file.originalname = req.file.originalname.replace(/\s/g, '_');
    console.log('Uploaded file:', req.file);
    res.json({ translation: `Translation completed for ${req.file.originalname}` });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/image',upload.single('image'), async (req, res) => {
    console.log(req.body);
    try {
      if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
      }

      console.log('File uploaded:', req.file);
      const Upfile = await uploadToGeminiBuffer(req.file);
      console.log('Uploaded file:', Upfile);
      const message = "let you are a prescription reader OCR, read the prescription and tell me what's written in here";
      const response = await getImageResponse(message, Upfile);
      res.json({ response });
  } catch (error) {
      console.error('Error handling file upload:', error);
      res.status(500).json({ message: 'An error occurred during upload' });
  }
    
} );

app.get('/', (req, res) => {
  res.render('index.ejs');
});

app.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    req.file.originalname = req.file.originalname.replace(/\s/g, '_');
    console.log('Uploaded file:', req.file);
    const message = "find the audio and tell me what's written in here";
    const response = await uploadAudio(req.file);
    res.json({ response });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  initializeChatSession();
});
