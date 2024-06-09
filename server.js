const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send('Welcome to the Shopify-Semaphore Integration App');
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

app.post('/webhook/order-create', async (req, res) => {
    const order = req.body;
    const message = `Thank you for your order, ${order.customer.first_name}! Your order number is ${order.id}.`;
    const recipient = order.customer.phone;

    try {
        const response = await sendSMS(message, recipient);
        res.status(200).send('Order create webhook received');
    } catch (error) {
        console.error('Error sending SMS:', error);
        res.status(500).send('Error sending SMS');
    }
});

const sendSMS = async (message, recipient) => {
    try {
        const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
            apikey: process.env.SEMAPHORE_API_KEY,
            message: message,
            number: recipient,
        });
        return response.data;
    } catch (error) {
        console.error('Error in sendSMS function:', error);
        throw error;
    }
};

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
