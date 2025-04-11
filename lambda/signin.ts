import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { Context, Hono } from 'hono'
import { handle, LambdaEvent } from 'hono/aws-lambda'
import { setCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'

type Bindings = {
    event: LambdaEvent
}
const TableName = process.env.DB_TABLE_NAME;

const fetchUser = async (email: string) => {
    const dbClient = new DynamoDB({})
    const db = DynamoDBDocument.from(dbClient)
    try {
        const result = await db.get({
            TableName,
            Key: {
                pk: 'user',
                sk: email,
            },
        })
        if (result.Item) return result.Item
        else {
            await db.put({
                TableName,
                Item: {
                    pk: 'user',
                    sk: email,
                    role: 'user'
                }
            })
            return { role: 'user' }
        }
    }
    catch (error: any) {
        throw new Error(error)
    }

}
const app = new Hono<{ Bindings: Bindings }>()
app.post('/signin', async (c: Context) => {
    const body = await c.req.json()
    const user = await fetchUser(body.email)
    const payload = {
        email: body.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expires in 60 minutes
    }
    setCookie(c, 'auth', await sign(payload, process.env.JWTSecret as string))
    return c.json({ role: user.role })
})

export const handler = handle(app)
