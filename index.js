const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
const fs = require('fs');

const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

app.use(cors());
app.use(express.json());

// ===== Serverless-Optimized MongoDB Connection =====
const uri = process.env.MONGODB_URI;
let cachedClient = null;

async function connectToDatabase() {
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Ensure CentralCafetariaServer/.env is present and valid.');
  }

  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    connectTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    maxPoolSize: 1,
    retryWrites: true,
    retryReads: true
  });

  try {
    await client.connect();
    // Test the connection
    await client.db('admin').command({ ping: 1 });
    cachedClient = client;
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    cachedClient = null;
    throw error;
  }
}

// ===== Modified Endpoints =====

// Register endpoint
// Register endpoint





app.post('/adminlogin', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Find admin user
    const admin = await db.collection('Users').findOne({ email, isadmin: true });

    if (!admin) {
      return res.status(401).json({ message: 'Unauthorized: Not an admin' });
    }

    // TEMP: Accept any password as "admin123" for now
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    res.status(200).json({
      message: 'Login successful',
      admin: {
        _id: admin._id,
        email: admin.email,
        isadmin: true,
        isSuperAdmin: admin.isSuperAdmin || false,
        role: 'admin' // Added role for client-side authentication context
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});





app.post('/login', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    // Try to find user by email or student ID
    const user = await db.collection('Users').findOne({
      $or: [{ email: identifier }, { id: identifier }]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({ message: 'Your account is not verified yet' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Destructure and prepare response data
    const { _id, email, id, role, name, privileged, isadmin, isSuperAdmin } = user;
    const resolvedRole = role || (isadmin || isSuperAdmin ? 'admin' : 'user');

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: _id,
        name: name || '',
        email,
        userId: id,
        role: resolvedRole,
        privileged: privileged || false
      }
    });

  } catch (error) {
    console.error('Login endpoint error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/login-qr', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { qrCodeString } = req.body;

    if (!qrCodeString) {
      return res.status(400).json({ message: 'QR code data is incomplete.' });
    }

    // Find user by matching the QR code string
    const user = await db.collection('Users').findOne({ qrCodeString });

    if (!user) {
      return res.status(404).json({ message: 'No matching user found for this QR code.' });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({ message: 'Your account is not verified yet.' });
    }

    // If user is found and verified, log them in without a password
    const { _id, email, role, name, privileged, id } = user;

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: _id,
        name: name || '',
        email,
        userId: id,
        role: role || 'user',
        privileged: privileged || false
      }
    });

  } catch (error) {
    console.error('QR Login endpoint error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});






// Update with actual path

app.post('/register', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { name, registrationNumber, email, id, password, qrCodeString, idCardFrontUrl, idCardBackUrl, role } = req.body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedRole = typeof role === 'string' ? role.toLowerCase().trim() : 'teacher';
    const allowedRoles = ['student', 'teacher', 'staff'];
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    if (!name || !email || !id || !password) {
      return res.status(400).json({ message: 'Name, email, ID and password are required' });
    }

    if (normalizedRole === 'student' && !registrationNumber) {
      return res.status(400).json({ message: 'Registration number is required for students' });
    }

    // Check for existing email, ID, or QR code string
    const existingUser = await db.collection('Users').findOne({
      $or: [{ email }, { id }, { qrCodeString }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({ message: 'Email already registered' });
      }
      if (existingUser.id === id) {
        return res.status(409).json({ message: 'ID already registered' });
      }
      if (qrCodeString && existingUser.qrCodeString === qrCodeString) {
        return res.status(409).json({ message: 'QR code already registered' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build user document
    const userDoc = {
      name,
      registrationNumber: normalizedRole === 'student' ? registrationNumber : '',
      email,
      id,
      role: normalizedRole,
      password: hashedPassword,
      qrCodeString,
      idCardFrontUrl,
      idCardBackUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
      verified: false
    };

    // Insert into DB
    const result = await db.collection('Users').insertOne(userDoc);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: result.insertedId,
        email: userDoc.email,
        id: userDoc.id,
        createdAt: userDoc.createdAt
      },
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/admins', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { name, email, password, address } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check for existing email
    const existingAdmin = await db.collection('Users').findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build admin document
    const adminDoc = {
      name,
      email,
      password: hashedPassword,
      address,
      isadmin: true,
      isSuperAdmin: false,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert into DB
    const result = await db.collection('Users').insertOne(adminDoc);

    res.status(201).json({
      message: 'Admin created successfully',
      user: {
        _id: result.insertedId,
        email: adminDoc.email,
      },
    });
  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

app.post('/admins', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { name, email, password, address } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check for existing email
    const existingAdmin = await db.collection('Users').findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build admin document
    const adminDoc = {
      name,
      email,
      password: hashedPassword,
      address,
      isadmin: true,
      isSuperAdmin: false,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert into DB
    const result = await db.collection('Users').insertOne(adminDoc);

    res.status(201).json({
      message: 'Admin created successfully',
      user: {
        _id: result.insertedId,
        email: adminDoc.email,
      },
    });
  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});


app.get('/users', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    // Basic filtering
    const filter = {};
    if (req.query.verified) {
      filter.verified = req.query.verified === 'true';
    }
    if (req.query.email) {
      filter.email = { $regex: req.query.email, $options: 'i' };
    }

    // Get users with pagination, newest first
    const users = await db.collection('Users')
      .find(filter, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count for pagination info
    const total = await db.collection('Users').countDocuments(filter);

    res.status(200).json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total
      }
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});



app.patch('/users/:id/privileged', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const usersCollection = db.collection('Users');

    const userId = req.params.id;
    const { privileged } = req.body;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { privileged: privileged === true || privileged === 'true' } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: 'User privilege updated successfully' });
    } else {
      res.status(404).json({ message: 'User not found or unchanged' });
    }
  } catch (error) {
    console.error('Error updating privileged status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:id/superadmin', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { isSuperAdmin } = req.body;

    if (typeof isSuperAdmin !== 'boolean') {
      return res.status(400).json({ message: 'Invalid isSuperAdmin status' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(id) },
      { $set: { isSuperAdmin } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Super admin status updated successfully' });
  } catch (error) {
    console.error('Error updating super admin status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/users/:id/privileged-status', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const usersCollection = db.collection('Users');

    const userId = req.params.id;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { privileged: 1 } }
    );

    if (user) {
      res.status(200).json({ privileged: user.privileged || false });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching privileged status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:id/verify', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const usersCollection = db.collection('Users');

    const userId = req.params.id;
    const { verified } = req.body;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { verified: verified === true || verified === 'true' } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: 'User verification status updated successfully' });
    } else {
      res.status(404).json({ message: 'User not found or already in desired state' });
    }
  } catch (error) {
    console.error('Error updating user verification status:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


app.delete('/users/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const usersCollection = db.collection('Users');

    const userId = req.params.id;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'User deleted successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { name, email, address, profilePicture } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (address) updateFields.address = address;
    if (profilePicture) updateFields.profilePicture = profilePicture;

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { name, email, address, profilePicture } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (address) updateFields.address = address;
    if (profilePicture) updateFields.profilePicture = profilePicture;

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/users/:id/coin-request', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { amount, receiptImageUrl } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    if (!amount || !receiptImageUrl) {
      return res.status(400).json({ message: 'Amount and receipt image URL are required' });
    }

    const newRequest = {
      _id: new ObjectId(),
      amount: parseInt(amount),
      receiptImageUrl,
      status: 'pending',
      requestedAt: new Date()
    };

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(id) },
      { $push: { coinIncreaseRequests: newRequest } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Coin increase request submitted successfully' });
  } catch (error) {
    console.error('Error submitting coin request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:userId/coin-requests/:requestId', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId, requestId } = req.params;
    const { status } = req.body;
    console.log(`[PATCH /users/:userId/coin-requests/:requestId] userId: ${userId}, requestId: ${requestId}, status: ${status}`);

    if (!ObjectId.isValid(userId) || !ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await db.collection('Users').findOne({ _id: new ObjectId(userId) });
    console.log('[PATCH /users/:userId/coin-requests/:requestId] user:', user);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.coinIncreaseRequests) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const request = user.coinIncreaseRequests.find(req => req._id.toString() === requestId);
    console.log('[PATCH /users/:userId/coin-requests/:requestId] request:', request);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const updateFields = { 'coinIncreaseRequests.$.status': status };
    if (status === 'approved') {
      updateFields.coins = (user.coins || 0) + request.amount;
    }

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(userId), 'coinIncreaseRequests._id': new ObjectId(requestId) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.status(200).json({ message: `Coin request ${status}` });
  } catch (error) {
    console.error('Error updating coin request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/users/:id/coin-requests', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await db.collection('Users').findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ coinRequests: user.coinIncreaseRequests || [] });
  } catch (error) {
    console.error('Error fetching coin requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/users/:id/coins', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await db.collection('Users').findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ coins: user.coins || 0 });
  } catch (error) {
    console.error('Error fetching coin balance:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Coin Value Endpoints =====
app.get('/coin-value', async (req, res) => {
    try {
        const client = await connectToDatabase();
        const db = client.db('CentralCafetaria');
        const settings = await db.collection('Settings').findOne({ _id: 'coinSettings' });

        if (settings) {
            res.status(200).json({ value: settings.value || 5, lastUpdatedAt: settings.lastUpdatedAt });
        } else {
            res.status(200).json({ value: 5, lastUpdatedAt: null }); // Default value
        }
    } catch (error) {
        console.error('Error fetching coin value:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/coin-value', async (req, res) => {
    try {
        const client = await connectToDatabase();
        const db = client.db('CentralCafetaria');
        const { value } = req.body;

        if (value === undefined || isNaN(parseFloat(value))) {
            return res.status(400).json({ message: 'Invalid coin value provided' });
        }

        await db.collection('Settings').updateOne(
            { _id: 'coinSettings' },
            { $set: { value: parseFloat(value), lastUpdatedAt: new Date() } },
            { upsert: true }
        );

        res.status(200).json({ message: 'Coin value updated successfully' });
    } catch (error) {
        console.error('Error updating coin value:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
app.post('/users/update-all-coin-balances', async (req, res) => {
  const client = await connectToDatabase();
  const db = client.db('CentralCafetaria');
  const session = client.startSession();

  try {
    const { oldValue, newValue } = req.body;

    if (!oldValue || !newValue || isNaN(parseFloat(oldValue)) || isNaN(parseFloat(newValue)) || parseFloat(newValue) <= 0) {
      return res.status(400).json({ message: 'Invalid old or new coin value provided.' });
    }

    const oldVal = parseFloat(oldValue);
    const newVal = parseFloat(newValue);
    const ratio = oldVal / newVal;

    console.log(`Old Value : ${oldVal}`);
    console.log(`New Value : ${newVal}`);
    console.log(`Ratio : ${ratio}`);
    let modifiedCount = 0;

    await session.withTransaction(async () => {
      const users = await db.collection('Users').find({ coins: { $gt: 0 } }, { session }).toArray();

      for (const user of users) {
        console.log(`User : ${user.name}`);

        const currentCoins = user.coins || 0;
        const newCoins = currentCoins * ratio;
        console.log(`User Current Coins : ${currentCoins}`);
        console.log(`User New Coins : ${newCoins}`);


        const result = await db.collection('Users').updateOne(
          { _id: user._id },
          { $set: { coins: newCoins } },
          { session }
        );
        modifiedCount += result.modifiedCount;
      }
    });

    res.status(200).json({ message: `Successfully updated coin balances for ${modifiedCount} users.` });

  } catch (error) {
    console.error('Error updating all coin balances:', error);
    res.status(500).json({ message: 'An error occurred while updating coin balances.' });
  } finally {
    session.endSession();
  }
});



// ===== Event Booking Endpoints =====

app.post('/events', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const eventsCollection = db.collection('Events');

    const { name, id, email, department, phone, eventDate, selectedPackage, packageQuantity } = req.body;

    // Basic validation
    if (!name || !id || !email || !department || !phone || !eventDate || !selectedPackage || !packageQuantity) {
      return res.status(400).json({ message: 'All fields are required for event booking.' });
    }

    const eventDocument = {
      ...req.body,
      eventDate: new Date(eventDate), // Convert to Date object
      status: 'pending', // Default status for event processing
      paymentStatus: 'unpaid', // Default payment status
      createdAt: new Date(),
    };

    const result = await eventsCollection.insertOne(eventDocument);

    res.status(201).json({
      message: 'Event booked successfully!',
      bookingId: result.insertedId,
    });

  } catch (error) {
    console.error('Error booking event:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/events', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const eventsCollection = db.collection('Events');

    const events = await eventsCollection.find({}).sort({ createdAt: -1 }).toArray();

    res.status(200).json(events);

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/events/:id/payment-status', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const eventsCollection = db.collection('Events');

    const eventId = req.params.id;
    const { paymentStatus } = req.body;

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: 'Invalid event ID format.' });
    }

    if (!['paid', 'unpaid', 'refunded'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status provided.' });
    }

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      { $set: { paymentStatus: paymentStatus, updatedAt: new Date() } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: `Event ${eventId} payment status updated to ${paymentStatus}.` });
    } else {
      res.status(404).json({ message: 'Event not found or payment status unchanged.' });
    }

  } catch (error) {
    console.error('Error updating event payment status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin: Cancel an event booking
app.patch('/events/:id/cancel', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const eventsCollection = db.collection('Events');

    const eventId = req.params.id;
    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: 'Invalid event ID format.' });
    }

    const update = {
      $set: {
        status: 'cancelled',
        cancelledBy: 'admin',
        cancelledAt: new Date(),
        cancelReason: req.body.reason || 'Cancelled by admin'
      }
    };

    const result = await eventsCollection.updateOne({ _id: new ObjectId(eventId) }, update);
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    res.status(200).json({ message: `Event ${eventId} cancelled successfully.` });
  } catch (error) {
    console.error('Error cancelling event:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/events/range', async (req, res) => {

  try {

    const client = await connectToDatabase();

    const db = client.db('CentralCafetaria');

    const { startDate, endDate } = req.query;



    if (!startDate || !endDate) {

      return res.status(400).json({ message: 'Start and end dates are required' });

    }



    const start = new Date(startDate + 'T00:00:00Z');

    const end = new Date(endDate + 'T00:00:00Z');



    const events = await db.collection('Events').aggregate([

      {

        $addFields: {

          convertedDate: { $toDate: "$eventDate" }

        }

      },

      {

        $match: {

          convertedDate: { $gte: start, $lt: end }

        }

      }

    ]).toArray();



    res.status(200).json(events);

  } catch (error) {

    res.status(500).json({ message: 'Internal server error' });

  }

});

app.get('/api/events/analytics-range', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');

    const query = {
      eventDate: { $gte: start, $lt: end },
      paymentStatus: 'paid'
    };

    const analytics = await db.collection('Events').aggregate([
      {
        $addFields: {
          convertedDate: { $toDate: "$eventDate" }
        }
      },
      {
        $match: {
          convertedDate: { $gte: start, $lt: end },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $multiply: [{ $toInt: "$packageQuantity" }, "$selectedPackage.price"] } },
          totalBookings: { $sum: 1 },
        }
      }
    ]).toArray();

    res.status(200).json(analytics[0] || { totalRevenue: 0, totalBookings: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add this new endpoint
app.get('/users/:userId/events', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const eventsCollection = db.collection('Events');

    const { userId } = req.params;

    if (!userId) { // Using userId as string, not ObjectId for this query
      return res.status(400).json({ message: 'User ID is required' });
    }

    const events = await eventsCollection.find({ id: userId }).sort({ eventDate: -1 }).toArray();

    res.status(200).json({ events });

  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.get('/foods', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');




    const foods = await db.collection('FoodItems').find().toArray();

    res.status(200).json(foods);
  } catch (error) {
    console.error('Error fetching foods:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/foods', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const food = req.body;

    // Add validation if necessary
    if (!food.name || !food.price || !food.category) {
      return res.status(400).json({ message: 'Missing required fields: name, price, category' });
    }

    const providedStock = Number(food.stock ?? food.quantity ?? 0);
    food.stock = Number.isNaN(providedStock) ? 0 : providedStock;

    // Initialize availability
    food.availability = {};
    if (Array.isArray(food.category)) {
      food.category.forEach(cat => {
        food.availability[cat] = true;
      });
    }

    const result = await db.collection('FoodItems').insertOne(food);
    res.status(201).json({ message: 'Food item created successfully', insertedId: result.insertedId });
  } catch (error) {
    console.error('Error creating food item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/foods/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const foodUpdate = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    // Ensure essential fields are not stripped out if not provided
    const { name, price, unit, image, rating, category, available, stock, quantity } = foodUpdate;
    const resolvedStockValue = stock !== undefined ? Number(stock) : (quantity !== undefined ? Number(quantity) : undefined);
    const updatedFood = {
      ...(name && { name }),
      ...(price && { price }),
      ...(unit && { unit }),
      ...(image && { image }),
      ...(rating && { rating }),
      ...(category && { category }),
      ...(available !== undefined && { available }),
      ...(resolvedStockValue !== undefined && !Number.isNaN(resolvedStockValue) && { stock: resolvedStockValue }),
      updatedAt: new Date()
    };

    if (category) {
      updatedFood.availability = {};
      if (Array.isArray(category)) {
        category.forEach(cat => {
          updatedFood.availability[cat] = true;
        });
      }
    }

    const result = await db.collection('FoodItems').updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedFood }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Food item not found' });
    }

    res.status(200).json({ message: 'Food item updated successfully' });
  } catch (error) {
    console.error('Error updating food item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/foods/:id/stock', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const stockValue = Number(req.body?.stock);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    if (Number.isNaN(stockValue) || stockValue < 0) {
      return res.status(400).json({ message: 'Stock must be a non-negative number' });
    }

    const result = await db.collection('FoodItems').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          stock: stockValue,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Food item not found' });
    }

    res.status(200).json({ message: 'Food stock updated successfully' });
  } catch (error) {
    console.error('Error updating food stock:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/foods/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('FoodItems').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Food item not found' });
    }

    res.status(200).json({ message: 'Food item deleted successfully' });
  } catch (error) {
    console.error('Error deleting food item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/raw-materials', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const materials = await db
      .collection('RawMaterials')
      .find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.status(200).json(materials);
  } catch (error) {
    console.error('Error fetching raw materials:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/raw-materials', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const {
      name,
      unit,
      supplier = '',
      currentStock,
      minStock
    } = req.body;

    const parsedCurrentStock = Number(currentStock);
    const parsedMinStock = Number(minStock);

    if (!name || !unit || Number.isNaN(parsedCurrentStock) || Number.isNaN(parsedMinStock)) {
      return res.status(400).json({ message: 'name, unit, currentStock and minStock are required' });
    }

    if (parsedCurrentStock < 0 || parsedMinStock < 0) {
      return res.status(400).json({ message: 'Stock values must be non-negative' });
    }

    const material = {
      name,
      unit,
      supplier,
      currentStock: parsedCurrentStock,
      minStock: parsedMinStock,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('RawMaterials').insertOne(material);
    res.status(201).json({ message: 'Raw material created successfully', insertedId: result.insertedId });
  } catch (error) {
    console.error('Error creating raw material:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/raw-materials/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const { name, unit, supplier, currentStock, minStock } = req.body;
    const updateDoc = {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(supplier !== undefined && { supplier }),
      ...(currentStock !== undefined && !Number.isNaN(Number(currentStock)) && { currentStock: Number(currentStock) }),
      ...(minStock !== undefined && !Number.isNaN(Number(minStock)) && { minStock: Number(minStock) }),
      updatedAt: new Date(),
    };

    const result = await db.collection('RawMaterials').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Raw material not found' });
    }

    res.status(200).json({ message: 'Raw material updated successfully' });
  } catch (error) {
    console.error('Error updating raw material:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/raw-materials/:id/stock', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const parsedStock = Number(req.body?.currentStock);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    if (Number.isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: 'currentStock must be a non-negative number' });
    }

    const result = await db.collection('RawMaterials').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          currentStock: parsedStock,
          updatedAt: new Date(),
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Raw material not found' });
    }

    res.status(200).json({ message: 'Raw material stock updated successfully' });
  } catch (error) {
    console.error('Error updating raw material stock:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/foods/:id/availability', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { category, status } = req.body;

    if (typeof status !== 'boolean' || !category) {
      return res.status(400).json({ message: 'Invalid availability status or category' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('FoodItems').updateOne(
      { _id: new ObjectId(id) },
      { $set: { [`availability.${category}`]: status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Food item not found' });
    }

    res.status(200).json({ message: 'Food availability updated successfully' });
  } catch (error) {
    console.error('Error updating food availability:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/foods/set-all-available', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const foods = await db.collection('FoodItems').find({}).toArray();

    for (const food of foods) {
      const newAvailability = {};
      if (Array.isArray(food.category)) {
        food.category.forEach(cat => {
          newAvailability[cat] = true;
        });
      }
      await db.collection('FoodItems').updateOne(
        { _id: food._id },
        { $set: { availability: newAvailability } }
      );
    }

    res.status(200).json({
      message: `${foods.length} food items set to available successfully.`
    });
  } catch (error) {
    console.error('Error setting all food items available:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.patch('/add-to-cart', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId, item } = req.body;

    if (!userId || !item) {
      return res.status(400).json({ message: 'Missing user ID or item' });
    }

    const user = await db.collection('Users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const itemExists = user.cart && user.cart.find(cartItem => cartItem.name === item.name);

    if (itemExists) {
      return res.status(409).json({ message: 'Item is already in cart.' });
    }

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $push: { cart: item } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'User not found or cart not updated' });
    }

    res.status(200).json({ message: 'Item added to cart successfully' });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.patch('/cart/update-unit', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId, itemName, newUnit } = req.body;

    if (!userId || !itemName || typeof newUnit !== 'number') {
      return res.status(400).json({ message: 'Missing or invalid fields' });
    }

    let result;

    if (newUnit === 0) {
      // Remove the item from cart
      result = await db.collection('Users').updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { cart: { name: itemName } } }
      );
    } else {
      // Update unit normally
      result = await db.collection('Users').updateOne(
        { _id: new ObjectId(userId), 'cart.name': itemName },
        { $set: { 'cart.$.unit': newUnit } }
      );
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Item not found or already set' });
    }

    res.status(200).json({ message: 'Cart updated successfully' });

  } catch (error) {
    console.error('Update unit error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




app.get('/cart/:userId', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId } = req.params;
    console.log(userId);

    // Validate ObjectId
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Find user by ID
    const user = await db.collection('Users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { cart: 1 } } // Only get the cart field
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send back cart items
    res.status(200).json({
      cart: user.cart || [],
    });

  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.delete('/cart/:userId', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { cart: [] } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Cart cleared successfully' });

  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



const ORDER_STATUS = Object.freeze({
  PLACED: 'Placed',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
});

const queueStreamClients = new Set();
const QUEUE_ORDERS_COLLECTION = 'QueueOrders';
const QUEUE_CONTROL_COLLECTION = 'QueueControl';
const QUEUE_CONTROL_DOC_ID = 'main';
const DEFAULT_QUEUE_CONTROL = {
  _id: QUEUE_CONTROL_DOC_ID,
  minutesPerOrder: 2,
  queueEnabled: true
};

const normalizeOrderStatus = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'placed') return ORDER_STATUS.PLACED;
  if (normalized === 'ready') return ORDER_STATUS.READY;
  if (normalized === 'completed') return ORDER_STATUS.COMPLETED;
  if (normalized === 'cancelled') return ORDER_STATUS.CANCELLED;

  return ORDER_STATUS.PLACED;
};

const getQueueOrdersCollection = (db) => db.collection(QUEUE_ORDERS_COLLECTION);

const generateUniqueQueueId = async (db) => {
  let queueId;
  let exists = true;
  const queueCollection = getQueueOrdersCollection(db);

  while (exists) {
    queueId = Math.floor(1000 + Math.random() * 9000);
    const existing = await queueCollection.findOne({ queueId });
    exists = !!existing;
  }

  return queueId;
};

const generateUniqueToken = async (db) => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TK-${datePart}-`;
  let attempts = 0;
  const queueCollection = getQueueOrdersCollection(db);

  while (attempts < 2000) {
    const suffix = Math.floor(100 + Math.random() * 900);
    const token = `${prefix}${suffix}`;
    const existing = await queueCollection.findOne({ token });
    if (!existing) {
      return token;
    }
    attempts += 1;
  }

  throw new Error('Failed to generate a unique token');
};

const calculateEstimatedWaitingMinutes = (queuePosition, minutesPerOrder = 2) => Math.max(queuePosition, 0) * Math.max(Number(minutesPerOrder) || 2, 1);

const ensureQueueControl = async (db) => {
  const collection = db.collection(QUEUE_CONTROL_COLLECTION);

  await collection.updateOne(
    { _id: QUEUE_CONTROL_DOC_ID },
    {
      $setOnInsert: {
        ...DEFAULT_QUEUE_CONTROL,
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );

  const doc = await collection.findOne({ _id: QUEUE_CONTROL_DOC_ID });
  return {
    ...DEFAULT_QUEUE_CONTROL,
    ...(doc || {})
  };
};

const getQueueStatsSnapshot = async (db) => {
  const queueCollection = getQueueOrdersCollection(db);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);

  const [
    totalOrdersToday,
    pendingOrders,
    readyOrders,
    completedOrders
  ] = await Promise.all([
    queueCollection.countDocuments({
      $or: [
        { created_at: { $gte: dayStart, $lt: nextDay } },
        { placedAt: { $gte: dayStart, $lt: nextDay } }
      ]
    }),
    queueCollection.countDocuments({ status: ORDER_STATUS.PLACED }),
    queueCollection.countDocuments({ status: ORDER_STATUS.READY }),
    queueCollection.countDocuments({ status: ORDER_STATUS.COMPLETED })
  ]);

  return {
    totalOrdersToday,
    pendingOrders,
    readyOrders,
    completedOrders
  };
};

const getCompletedOrdersSnapshot = async (db, limit = 100) => {
  const queueCollection = getQueueOrdersCollection(db);

  return queueCollection
    .find({ status: ORDER_STATUS.COMPLETED })
    .sort({ completed_at: -1, placedAt: -1 })
    .limit(limit)
    .toArray();
};

const getActiveQueueSnapshot = async (db) => {
  const refreshedQueue = await refreshQueuePositions(db);

  return refreshedQueue
    .map((order) => ({
      ...order,
      userId: String(order.userId)
    }))
    .sort((a, b) => a.queue_position - b.queue_position);
};

const broadcastQueueUpdate = async (db) => {
  if (queueStreamClients.size === 0) {
    return;
  }

  const [activeQueue, completedOrders, stats] = await Promise.all([
    getActiveQueueSnapshot(db),
    getCompletedOrdersSnapshot(db),
    getQueueStatsSnapshot(db)
  ]);

  const payload = JSON.stringify({
    activeQueue,
    completedOrders: completedOrders.map((order) => ({
      ...order,
      status: ORDER_STATUS.COMPLETED
    })),
    stats,
    updatedAt: new Date().toISOString()
  });

  for (const client of queueStreamClients) {
    client.write(`event: queue_update\n`);
    client.write(`data: ${payload}\n\n`);
  }
};

const refreshQueuePositions = async (db) => {
  const queueCollection = getQueueOrdersCollection(db);
  const queueControl = await ensureQueueControl(db);
  const minutesPerOrder = queueControl.minutesPerOrder || 2;

  const activeOrders = await queueCollection
    .find({
      status: {
        $in: [ORDER_STATUS.PLACED, ORDER_STATUS.READY]
      }
    })
    .sort({ created_at: 1, placedAt: 1, _id: 1 })
    .toArray();

  if (activeOrders.length === 0) {
    return [];
  }

  const bulkOps = activeOrders.map((order, index) => {
    const normalizedStatus = normalizeOrderStatus(order.status);
    const queuePosition = index + 1;

    return {
      updateOne: {
        filter: { _id: order._id },
        update: {
          $set: {
            status: normalizedStatus,
            queue_position: queuePosition,
            estimated_waiting_minutes: calculateEstimatedWaitingMinutes(queuePosition, minutesPerOrder)
          }
        }
      }
    };
  });

  await queueCollection.bulkWrite(bulkOps);

  return activeOrders.map((order, index) => ({
    ...order,
    status: normalizeOrderStatus(order.status),
    queue_position: index + 1,
    estimated_waiting_minutes: calculateEstimatedWaitingMinutes(index + 1, minutesPerOrder)
  }));
};

app.post('/order/queue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
      const { userId, usePrivilege = false, payWithCoins = false, tableNumber = null, counter: selectedCounter = null } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find user and their cart
    const user = await db.collection('Users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { cart: 1, privileged: 1, coins: 1, name: 1, id: 1, role: 1 } }
    );

    if (!user || !user.cart || user.cart.length === 0) {
      return res.status(400).json({ message: 'No items in cart' });
    }

    // Check for item availability
    const unavailableItems = [];
    for (const cartItem of user.cart) {
      const foodItem = await db.collection('FoodItems').findOne({ name: cartItem.name });
      if (!foodItem || !foodItem.availability || !foodItem.availability[cartItem.category]) {
        unavailableItems.push(cartItem.name);
      }
    }

    if (unavailableItems.length > 0) {
      return res.status(400).json({
        message: `The following items are not available: ${unavailableItems.join(', ')}`,
      });
    }

    // If user is not actually privileged but tries to use it
    if (usePrivilege && !user.privileged) {
      return res.status(403).json({ message: 'Unauthorized privilege usage attempt' });
    }

    if (user && (user.role === 'student' || user.role === 'staff')) {
      if (!selectedCounter) {
        return res.status(400).json({ message: 'Counter selection is required for students and staff.' });
      }
      if (!['1', '2'].includes(String(selectedCounter))) {
        return res.status(400).json({ message: 'Invalid counter selection.' });
      }
    }

    // Generate queue ID + token
    const queueId = await generateUniqueQueueId(db);
    const token = await generateUniqueToken(db);

    const totalPrice = usePrivilege
      ? 0
      : user.cart.reduce((acc, item) => acc + (item.unit * Number(item.price)), 0);

    const now = new Date();
    const queueCollection = getQueueOrdersCollection(db);
    const queueControl = await ensureQueueControl(db);
    const minutesPerOrder = queueControl.minutesPerOrder || 2;

    const activeCount = await queueCollection.countDocuments({
      status: {
        $in: [ORDER_STATUS.PLACED, ORDER_STATUS.READY]
      }
    });

    const initialQueuePosition = activeCount + 1;

    const isTeacher = user && (user.role === 'teacher' || user.role === 'Teacher');

    const order = {
      token,
      queueId,
      userId: new ObjectId(userId),
      customer_name: user.name || user.id || 'Customer',
      items: user.cart,
      orderDetails: user.cart,
      created_at: now,
      placedAt: now,
      // If teacher, mark ready (no waiting)
      status: isTeacher ? ORDER_STATUS.READY : ORDER_STATUS.PLACED,
      queue_position: isTeacher ? 0 : initialQueuePosition,
      estimated_waiting_minutes: isTeacher ? 0 : calculateEstimatedWaitingMinutes(initialQueuePosition, minutesPerOrder),
      completed_at: null,
      totalPrice,
      tableNumber: tableNumber || null,
      counter: selectedCounter || null,
      ...(usePrivilege && { privilegeUsed: true }),
      ...(payWithCoins && { paidWithCoins: true })
    };

    if (payWithCoins) {
      const settings = await db.collection('Settings').findOne({ _id: 'coinSettings' });
      const coinValue = settings && settings.value ? settings.value : 5; // Default to 5 if not set
      const coinCost = totalPrice / coinValue;

      if ((user.coins || 0) < coinCost) {
        return res.status(400).json({ message: 'Insufficient coin balance' });
      }
      await db.collection('Users').updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { coins: -coinCost } }
      );
    }


    // If teacher, do NOT insert into the main queue; store as immediate order instead
    let insertResult;
    let finalQueuePosition = initialQueuePosition;
    if (isTeacher) {
      const immediateCollection = db.collection('ImmediateOrders');
      insertResult = await immediateCollection.insertOne(order);
      finalQueuePosition = 0;
      // Do not broadcast queue update for teacher immediate orders
    } else {
      // Insert into queue orders collection
      insertResult = await queueCollection.insertOne(order);

      const refreshedQueue = await refreshQueuePositions(db);
      const placedOrder = refreshedQueue.find((entry) => String(entry._id) === String(insertResult.insertedId));
      finalQueuePosition = placedOrder?.queue_position || initialQueuePosition;

      await broadcastQueueUpdate(db);
    }

    // Clear user cart after placing order
    await db.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { cart: [] } }
    );

    res.status(201).json({
      message: 'Order placed successfully',
      token,
      queueId,
      queuePosition: isTeacher ? 0 : finalQueuePosition,
      status: isTeacher ? ORDER_STATUS.READY : ORDER_STATUS.PLACED,
      estimatedWaitingMinutes: isTeacher ? 0 : calculateEstimatedWaitingMinutes(finalQueuePosition, minutesPerOrder),
      order: {
        ...order,
        _id: insertResult.insertedId,
        queue_position: isTeacher ? 0 : finalQueuePosition,
        estimated_waiting_minutes: isTeacher ? 0 : calculateEstimatedWaitingMinutes(finalQueuePosition, minutesPerOrder)
      }
    });

  } catch (error) {
    console.error('Order queue error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.patch('/order/:id/status', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { status } = req.body;

    const nextStatus = normalizeOrderStatus(status);
    if (![ORDER_STATUS.READY, ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED].includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid status value. Use Ready, Completed or Cancelled.' });
    }

    const queueCollection = getQueueOrdersCollection(db);
    const order = await queueCollection.findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const currentStatus = normalizeOrderStatus(order.status);

    if (currentStatus === ORDER_STATUS.COMPLETED || currentStatus === ORDER_STATUS.CANCELLED) {
      return res.status(400).json({ message: `Order is already ${currentStatus}.` });
    }

    if (nextStatus === ORDER_STATUS.READY && currentStatus !== ORDER_STATUS.PLACED) {
      return res.status(400).json({ message: 'Only placed orders can be moved to ready.' });
    }

    if (nextStatus === ORDER_STATUS.COMPLETED && ![ORDER_STATUS.PLACED, ORDER_STATUS.READY].includes(currentStatus)) {
      return res.status(400).json({ message: 'Only placed or ready orders can be completed.' });
    }

    // If order is cancelled and was paid with coins, refund the coins
    if (nextStatus === ORDER_STATUS.CANCELLED && order.paidWithCoins) {
      const settings = await db.collection('Settings').findOne({ _id: 'coinSettings' });
      const coinValue = settings && settings.value ? settings.value : 5;
      const coinRefundAmount = (order.totalPrice || 0) / coinValue;

      await db.collection('Users').updateOne(
        { _id: new ObjectId(order.userId) },
        { $inc: { coins: coinRefundAmount } }
      );
    }

    const updatePayload = {
      status: nextStatus,
      ...(nextStatus === ORDER_STATUS.COMPLETED || nextStatus === ORDER_STATUS.CANCELLED
        ? { completed_at: new Date(), queue_position: null, estimated_waiting_minutes: 0 }
        : {})
    };

    const result = await queueCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatePayload }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Order not found or already updated' });
    }

    await refreshQueuePositions(db);
    await broadcastQueueUpdate(db);

    res.status(200).json({ message: `Order marked as ${nextStatus}` });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/order/:id/received', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { userId } = req.body;

    const queueCollection = getQueueOrdersCollection(db);
    const order = await queueCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (userId && String(order.userId) !== String(userId)) {
      return res.status(403).json({ message: 'You can only complete your own order.' });
    }

    const currentStatus = normalizeOrderStatus(order.status);
    if (![ORDER_STATUS.PLACED, ORDER_STATUS.READY].includes(currentStatus)) {
      return res.status(400).json({ message: 'Only placed or ready orders can be marked as completed.' });
    }

    await queueCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: ORDER_STATUS.COMPLETED,
          completed_at: new Date(),
          queue_position: null,
          estimated_waiting_minutes: 0
        }
      }
    );

    await refreshQueuePositions(db);
    await broadcastQueueUpdate(db);

    res.status(200).json({ message: 'Order marked as Completed.' });
  } catch (error) {
    console.error('Received confirmation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.get('/queue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const queueCollection = getQueueOrdersCollection(db);

    await refreshQueuePositions(db);

    const orders = await queueCollection
      .find({})
      .sort({ created_at: -1, placedAt: -1 })
      .toArray();

    const normalizedOrders = orders.map((order) => ({
      ...order,
      status: normalizeOrderStatus(order.status)
    }));

    res.status(200).json({
      message: 'All queue orders fetched successfully',
      data: normalizedOrders
    });
  } catch (error) {
    console.error('Error fetching queue orders:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/queue/stream', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    queueStreamClients.add(res);

    const [activeQueue, completedOrders, stats] = await Promise.all([
      getActiveQueueSnapshot(db),
      getCompletedOrdersSnapshot(db),
      getQueueStatsSnapshot(db)
    ]);

    const initialPayload = JSON.stringify({
      activeQueue,
      completedOrders: completedOrders.map((order) => ({
        ...order,
        status: ORDER_STATUS.COMPLETED
      })),
      stats,
      updatedAt: new Date().toISOString()
    });

    res.write('event: queue_update\n');
    res.write(`data: ${initialPayload}\n\n`);

    const keepAlive = setInterval(() => {
      res.write('event: ping\n');
      res.write('data: {}\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      queueStreamClients.delete(res);
      res.end();
    });
  } catch (error) {
    console.error('Queue stream error:', error);
    res.status(500).json({ message: 'Failed to start queue stream' });
  }
});

app.get('/latqueue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const orders = await getActiveQueueSnapshot(db);

    res.status(200).json({
      message: 'Active queue orders fetched successfully',
      data: orders
    });
  } catch (error) {
    console.error('Error fetching queue orders:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/queue/completed', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const completedOrders = await getCompletedOrdersSnapshot(db, 500);

    res.status(200).json({
      message: 'Completed orders fetched successfully',
      data: completedOrders.map((order) => ({
        ...order,
        status: ORDER_STATUS.COMPLETED
      }))
    });
  } catch (error) {
    console.error('Error fetching completed orders:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/queue/token/:token', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const queueCollection = getQueueOrdersCollection(db);
    const { token } = req.params;
    const queueControl = await ensureQueueControl(db);
    const minutesPerOrder = queueControl.minutesPerOrder || 2;

    await refreshQueuePositions(db);

    const order = await queueCollection.findOne({ token });

    if (!order) {
      return res.status(404).json({ message: 'No order found for this token.' });
    }

    const normalizedStatus = normalizeOrderStatus(order.status);
    const queuePosition = Number(order.queue_position) > 0 ? Number(order.queue_position) : 1;
    res.status(200).json({
      message: 'Order fetched successfully',
      data: {
        ...order,
        status: normalizedStatus,
        estimated_waiting_minutes: normalizedStatus === ORDER_STATUS.COMPLETED
          ? 0
          : (Number(order.estimated_waiting_minutes) > 0
            ? Number(order.estimated_waiting_minutes)
            : calculateEstimatedWaitingMinutes(queuePosition, minutesPerOrder))
      }
    });
  } catch (error) {
    console.error('Error searching by token:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/queue-control', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const control = await ensureQueueControl(db);

    res.status(200).json(control);
  } catch (error) {
    console.error('Error fetching queue control:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/queue-control', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    const { minutesPerOrder, queueEnabled } = req.body;
    const updates = { updatedAt: new Date() };

    if (minutesPerOrder !== undefined) {
      const parsed = Number(minutesPerOrder);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return res.status(400).json({ message: 'minutesPerOrder must be a number >= 1' });
      }
      updates.minutesPerOrder = parsed;
    }

    if (queueEnabled !== undefined) {
      updates.queueEnabled = Boolean(queueEnabled);
    }

    await db.collection(QUEUE_CONTROL_COLLECTION).updateOne(
      { _id: QUEUE_CONTROL_DOC_ID },
      {
        $setOnInsert: {
          ...DEFAULT_QUEUE_CONTROL,
          createdAt: new Date()
        },
        $set: updates
      },
      { upsert: true }
    );

    const control = await ensureQueueControl(db);

    await refreshQueuePositions(db);
    await broadcastQueueUpdate(db);

    res.status(200).json({ message: 'Queue control updated', control });
  } catch (error) {
    console.error('Error updating queue control:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/queue/stats', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');

    await refreshQueuePositions(db);
    const stats = await getQueueStatsSnapshot(db);

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Enhanced Sales Report Endpoints =====

// Get available months with sales data
app.get('/api/sales/months', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const ordersCollection = getQueueOrdersCollection(db);
    const eventsCollection = db.collection('Events');

    const salesMonthsPromise = ordersCollection.aggregate([
      { $match: { status: ORDER_STATUS.COMPLETED } },
      {
        $group: {
          _id: {
            year: { $year: '$placedAt' },
            month: { $month: '$placedAt' }
          }
        }
      }
    ]).toArray();

    const eventMonthsPromise = eventsCollection.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$eventDate' },
            month: { $month: '$eventDate' }
          }
        }
      }
    ]).toArray();

    const [salesMonths, eventMonths] = await Promise.all([salesMonthsPromise, eventMonthsPromise]);

    const combined = [...salesMonths, ...eventMonths];
    const uniqueMonthsMap = new Map();

    combined.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (!uniqueMonthsMap.has(key)) {
        uniqueMonthsMap.set(key, {
          year: item._id.year,
          month: item._id.month
        });
      }
    });

    const uniqueMonths = Array.from(uniqueMonthsMap.values())
      .sort((a, b) => {
        if (b.year !== a.year) {
          return b.year - a.year;
        }
        return b.month - a.month;
      });

    res.status(200).json(uniqueMonths);
  } catch (error) {
    console.error('Error fetching months:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get daily sales for a specific month
app.get('/api/sales/monthly-daily', async (req, res) => {
  try {
    const { year, month } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 1);

    const sales = await getSalesReport(startDate, endDate, page, limit);
    const analytics = await getSalesAnalytics(startDate, endDate);

    res.status(200).json({ ...sales, analytics });
  } catch (error) {
    console.error('Error fetching monthly daily sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get weekly sales for a specific month
app.get('/api/sales/monthly-weekly', async (req, res) => {
  try {
    const { year, month } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 1);

    const sales = await getSalesReport(startDate, endDate, page, limit);
    const analytics = await getSalesAnalytics(startDate, endDate);

    res.status(200).json({ ...sales, analytics });
  } catch (error) {
    console.error('Error fetching monthly weekly sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get sales for specific date
app.get('/api/sales/date', async (req, res) => {
  try {
    const { date } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    const sales = await getSalesReport(startDate, endDate, page, limit);
    const analytics = await getSalesAnalytics(startDate, endDate);

    res.status(200).json({ ...sales, analytics });
  } catch (error) {
    console.error('Error fetching date sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get sales for specific week
app.get('/api/sales/week', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const sales = await getSalesReport(start, end, page, limit);
    const analytics = await getSalesAnalytics(start, end);

    res.status(200).json({ ...sales, analytics });
  } catch (error) {
    console.error('Error fetching week sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get sales for a specific date range
app.get('/api/sales/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const sales = await getSalesReport(start, end, page, limit);
    const analytics = await getSalesAnalytics(start, end);

    res.status(200).json({ ...sales, analytics });
  } catch (error) {
    console.error('Error fetching range sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get sales for a specific date range for download
app.get('/api/sales/download', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const ordersCollection = getQueueOrdersCollection(db);

    const query = {
      status: ORDER_STATUS.COMPLETED,
      placedAt: { $gte: start, $lt: end }
    };

    const sales = await ordersCollection
      .find(query)
      .sort({ placedAt: -1 })
      .toArray();

    res.status(200).json(sales);
  } catch (error) {
    console.error('Error fetching sales for download:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper function to fetch sales report data with pagination
const getSalesReport = async (startDate, endDate, page, limit) => {
  const client = await connectToDatabase();
  const db = client.db('CentralCafetaria');
  const ordersCollection = getQueueOrdersCollection(db);

  const query = {
    status: ORDER_STATUS.COMPLETED,
    placedAt: { $gte: startDate, $lt: endDate }
  };

  const total = await ordersCollection.countDocuments(query);
  const sales = await ordersCollection
    .find(query)
    .sort({ placedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  return {
    data: sales,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total
    }
  };
};

// Get overall sales analytics for a given month or the current month
app.get('/api/sales/overall-analytics', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const ordersCollection = getQueueOrdersCollection(db);

    const { year, month } = req.query;
    let startDate, endDate;

    if (year && month) {
      startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      endDate = new Date(parseInt(year), parseInt(month), 1);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const query = {
      status: ORDER_STATUS.COMPLETED,
      placedAt: { $gte: startDate, $lt: endDate }
    };

    const analytics = await ordersCollection.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
        }
      }
    ]).toArray();

    res.status(200).json(analytics[0] || { totalRevenue: 0, totalOrders: 0 });
  } catch (error) {
    console.error('Error fetching overall analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Enhanced analytics function
const getSalesAnalytics = async (startDate, endDate) => {
  const client = await connectToDatabase();
  const db = client.db('CentralCafetaria');
  const ordersCollection = getQueueOrdersCollection(db);

  const query = {
    status: ORDER_STATUS.COMPLETED,
    placedAt: { $gte: startDate, $lt: endDate }
  };

  const analytics = await ordersCollection.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalPrice' },
        totalOrders: { $sum: 1 },
        totalItemsSold: { $sum: { $size: '$orderDetails' } },
        averageOrderValue: { $avg: '$totalPrice' }
      }
    }
  ]).toArray();

  return analytics[0] || {
    totalRevenue: 0,
    totalOrders: 0,
    totalItemsSold: 0,
    averageOrderValue: 0
  };
};







// ===== Food Packages API =====

// POST a new food package
app.post('/food-packages', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { name, price, items } = req.body;

    const newPackage = {
      name,
      price,
      items,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('FoodPackages').insertOne(newPackage);

    res.status(201).json({ message: 'Package created successfully', insertedId: result.insertedId });
  } catch (error) {
    console.error('Error creating food package:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET all food packages
app.get('/food-packages', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const packages = await db.collection('FoodPackages').find({}).toArray();
    res.status(200).json(packages);
  } catch (error) {
    console.error('Error fetching food packages:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/users/:userId/refund-coins', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId } = req.params;
    const { amount } = req.body;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    if (amount === undefined || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid amount provided' });
    }

    const result = await db.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { coins: parseFloat(amount) } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: `Successfully refunded ${amount} coins to user ${userId}` });
  } catch (error) {
    console.error('Error refunding coins:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// EDIT a food package by ID
app.put('/food-packages/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;
    const { name, price, items } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updatedPackage = {
      name,
      price,
      items,
      updatedAt: new Date()
    };

    const result = await db.collection('FoodPackages').updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedPackage }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.status(200).json({ message: 'Package updated successfully' });
  } catch (error) {
    console.error('Error updating food package:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE a food package by ID
app.delete('/food-packages/:id', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('FoodPackages').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.status(200).json({ message: 'Package deleted successfully' });
  } catch (error) {
    console.error('Error deleting food package:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('Central Cafetaria is running');
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}