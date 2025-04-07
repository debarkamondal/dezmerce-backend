import { Hono } from 'hono'
import { handle, LambdaEvent } from 'hono/aws-lambda'

type Bindings = {
    event: LambdaEvent
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/for', (c) => {

    return c.json(c.env.event.requestContext)
}
)

export const handler = handle(app)
