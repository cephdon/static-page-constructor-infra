var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {

    const params = {
        TableName: "static-cms-pages",
        ProjectionExpression: "#N, #S",
        ExpressionAttributeNames: {
            "#N": "name", 
            "#S": "slug"
        }
    };

    dynamodb.scan(params, function(err, data) {
        if (err) {
            callback(null, {
                statusCode: 500,
                body: JSON.stringify(err),
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } else {
            const pages = data.Items;

            callback(null, {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify(pages.map(page => {
                    return {
                        name: page.name.S,
                        slug: page.slug.S
                    }
                }))
            });
        }
    });
};