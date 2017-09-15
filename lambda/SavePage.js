var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    const page = JSON.parse(event.body);
    page.configuration = page.configuration || [];
    
    const params = {
        Item: {
            "slug": {
                S: page.slug
            },
            "name": {
                S: page.name
            },
            "configuration": {
                S: JSON.stringify(page.configuration)
            }
        },
        TableName: 'static-cms-pages'
    };

    dynamodb.putItem(params, function(err, data) {
        if (err) {
            callback(null, {
                statusCode: 404,
                body: '',
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } else {
            callback(null, {
                statusCode: 200,
                body: JSON.stringify(page),
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    });
};