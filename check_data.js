const mongoose = require('mongoose');
const Order = require('./models/order');
const User = require('./models/user');

async function checkData() {
    try {
        await mongoose.connect('mongodb://localhost:27017/ecommerce', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const deliveredOrders = await Order.find({
            status: 3,
            orderedAt: { $gte: thirtyDaysAgo.getTime() }
        });

        console.log('Delivered orders in last 30 days:', deliveredOrders.length);

        if (deliveredOrders.length > 0) {
            const sellers = await Order.aggregate([
                {
                    $match: {
                        status: 3,
                        orderedAt: { $gte: thirtyDaysAgo.getTime() }
                    }
                },
                { $unwind: '$products' },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'products.product.sellerId',
                        foreignField: '_id',
                        as: 'seller',
                    },
                },
                { $unwind: '$seller' },
                {
                    $group: {
                        _id: '$seller._id',
                        name: { $first: '$seller.name' },
                        shopName: { $first: '$seller.shopName' },
                        shopAvatar: { $first: '$seller.shopAvatar' },
                        totalRevenue: {
                            $sum: {
                                $multiply: ['$products.quantity', '$products.product.price'],
                            },
                        },
                    },
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 },
            ]);

            console.log('Top sellers found:', sellers.length);
            console.log('Sample seller:', sellers[0] || 'None');
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkData();
