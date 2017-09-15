var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {

    const params = {
        TableName: "static-cms-widgets",
        ProjectionExpression: "#N, #S, #WP",
        ExpressionAttributeNames: {
            "#N": "name", 
            "#S": "slug",
            "#WP": "previewImage"
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
                body: JSON.stringify(pages.map(page => {
                    return {
                        name: page.name.S,
                        slug: page.slug.S,
                        previewImage: page.previewImage.S
                    }
                })),
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    });
};