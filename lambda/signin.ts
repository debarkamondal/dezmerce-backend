import { Context, Hono } from 'hono'
import { handle, LambdaEvent } from 'hono/aws-lambda'
import { setCookie} from 'hono/cookie'
import { sign } from 'hono/jwt'

type Bindings = {
    event: LambdaEvent
}

const app = new Hono<{ Bindings: Bindings }>()

app.post('/signin', async (c: Context) => {
    const body = await c.req.json()
    const role = body.email === "debarkamondal@gmail.com" ? "admin" : "user"
    const payload = {
        email: body.email,
        role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expires in 60 minutes
    }
    setCookie(c, 'auth', await sign(payload, process.env.JWTSecret as string))
    return c.json({role})
})

export const handler = handle(app)
