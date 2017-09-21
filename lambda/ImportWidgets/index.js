var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    const definitions = JSON.parse(event.body);
    
    const putRequests = definitions.map(definition => {
        return {
            PutRequest: {
                Item: {
                    "slug": {
                        S: definition.slug
                    },
                    "name": {
                        S: definition.name
                    },
                    "previewImage": {
                        S: definition.previewImage
                    },
                    "html": {
                        S: definition.html
                    },
                    "props": {
                        S: JSON.stringify(definition.props)
                    },
                    "layout": {
                        S: JSON.stringify(definition.layout || {})
                    }
                }
            }
        }
    });

    const params = {
        RequestItems: {
            [process.env.WIDGETS_TABLE_NAME]: putRequests
        }
    };
    
    dynamodb.batchWriteItem(params, function(err, data) {
        if (err) {
            callback(null, {
                statusCode: 500,
                body: JSON.stringify(err),
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } else {
            callback(null, {
                statusCode: 200,
                body: '',
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    });
};