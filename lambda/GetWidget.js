var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    if (event.queryStringParameters && event.queryStringParameters.slug) {
        const slug = event.queryStringParameters.slug;

        const params = {
            Key: {
                "slug": {
                    S: slug
                }
            }, 
            TableName: "static-cms-widgets"
        };

        dynamodb.getItem(params, function(err, data) {
            if (err || !data.Item) {
                callback(null, {
                    statusCode: 404,
                    body: '',
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } else {
                const definition = data.Item;

                callback(null, {
                    statusCode: 200,
                    body: JSON.stringify({
                        name: definition.name.S,
                        slug: definition.slug.S,
                        previewImage: definition.previewImage.S,
                        props: JSON.parse(definition.props.S),
                        layout: JSON.parse(definition.layout.S),
                    }),
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        });
    } else {
        callback(null, {
            statusCode: 400,
            body: '',
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};