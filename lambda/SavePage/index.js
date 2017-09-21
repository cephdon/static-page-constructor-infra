var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    const page = JSON.parse(event.body);
    page.configuration = page.configuration || [];
    page.props = page.props || {};
    
    const params = {
        Item: {
            "slug": {
                S: page.slug
            },
            "name": {
                S: page.name
            },
            "template": {
                S: page.template
            },
            "configuration": {
                S: JSON.stringify(page.configuration)
            },
            "props": {
                S: JSON.stringify(page.props)
            }
        },
        TableName: process.env.PAGES_TABLE_NAME
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