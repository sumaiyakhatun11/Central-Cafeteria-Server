const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

app.use(cors());
app.use(express.json());

// ===== Serverless-Optimized MongoDB Connection =====
const uri = process.env.MONGODB_URI;
let cachedClient = null;

async function connectToDatabase() {
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
        isSuperAdmin: admin.isSuperAdmin || false
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
    const { _id, email, id, role, name, privileged } = user;

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

    const { name, registrationNumber, email, id, password, qrCodeString, idCardFrontUrl, idCardBackUrl } = req.body;

    // Validate required fields
    if (!name || !registrationNumber || !email || !id || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
      registrationNumber,
      email,
      id,
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Basic filtering
    const filter = {};
    if (req.query.verified) {
      filter.verified = req.query.verified === 'true';
    }
    if (req.query.email) {
      filter.email = { $regex: req.query.email, $options: 'i' };
    }

    // Get users with pagination
    const users = await db.collection('Users')
      .find(filter, { projection: { password: 0 } })
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
    const { name, price, unit, image, rating, category, available } = foodUpdate;
    const updatedFood = {
      ...(name && { name }),
      ...(price && { price }),
      ...(unit && { unit }),
      ...(image && { image }),
      ...(rating && { rating }),
      ...(category && { category }),
      ...(available !== undefined && { available }),
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



const generateUniqueQueueId = async (db) => {
  let queueId;
  let exists = true;

  while (exists) {
    queueId = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    const existing = await db.collection('OrdersQueue').findOne({ queueId });
    exists = !!existing;
  }

  return queueId;
};

app.post('/order/queue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const { userId, usePrivilege = false, payWithCoins = false } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find user and their cart
    const user = await db.collection('Users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { cart: 1, privileged: 1, coins: 1 } }
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

    // Generate unique 4-digit queue ID
    const queueId = await generateUniqueQueueId(db);

    const totalPrice = usePrivilege
      ? 0
      : user.cart.reduce((acc, item) => acc + (item.unit * Number(item.price)), 0);

    const order = {
      queueId,
      userId: new ObjectId(userId),
      orderDetails: user.cart,
      placedAt: new Date(),
      status: 'pending',
      totalPrice,
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

    // Insert into OrdersQueue
    await db.collection('OrdersQueue').insertOne(order);

    // Clear user cart after placing order
    await db.collection('Users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { cart: [] } }
    );

    res.status(201).json({
      message: 'Order placed successfully',
      queueId,
      order
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

    if (!['served', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const result = await db.collection('OrdersQueue').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Order not found or already updated' });
    }

    res.status(200).json({ message: `Order marked as ${status}` });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.get('/queue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const queueCollection = db.collection('OrdersQueue');

    const orders = await queueCollection
      .find({}) // latest orders first
      .toArray();


    res.status(200).json({
      message: 'All queue orders fetched successfully',
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

app.get('/latqueue', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const queueCollection = db.collection('OrdersQueue');

    const orders = await queueCollection
      .find({
        status: { $nin: ['served', 'cancelled'] } // Exclude served & cancelled
      }) // latest orders first (corrected field name)
      .toArray();

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

// ===== Enhanced Sales Report Endpoints =====

// Get available months with sales data
app.get('/api/sales/months', async (req, res) => {
  try {
    const client = await connectToDatabase();
    const db = client.db('CentralCafetaria');
    const ordersCollection = db.collection('OrdersQueue');
    const eventsCollection = db.collection('Events');

    const salesMonthsPromise = ordersCollection.aggregate([
      { $match: { status: 'served' } },
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
    const ordersCollection = db.collection('OrdersQueue');

    const query = {
      status: 'served',
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
  const ordersCollection = db.collection('OrdersQueue');

  const query = {
    status: 'served',
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
    const ordersCollection = db.collection('OrdersQueue');

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
      status: 'served',
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
  const ordersCollection = db.collection('OrdersQueue');

  const query = {
    status: 'served',
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