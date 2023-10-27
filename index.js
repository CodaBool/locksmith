import puppeteer from "@cloudflare/puppeteer"

const BATCH_SIZE = 2
const MINIMUM = 500

// auth()

async function itch(env) {
  const res = await fetch("https://itch.io/api/1/key/my-games", {
    headers: {'Authorization': `Bearer ${env.ITCH_TOKEN}`}
  })
  const data = await res.json()
  const ids = new Map()
  data.games.forEach(game => {
    console.log(`${game.title}: purchased ${game.purchases_count} with ${game.views_count} views`)
    ids.set(game.id, game.title)
  })
  return ids
}

async function foundry(env) {
  const data = {
    package_name: 'terminal',
    quantity: BATCH_SIZE,
    dry_run: env.DEBUG ? true : false,
  }
  const res = await fetch("https://api.foundryvtt.com/_api/packages/issue-key", {
    headers: {
      'Authorization': `APIKey:codabool_${env.FOUNDRY_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    method: "POST",
  })
  const body = await res.json()
  if (body.status !== "success" || body.keys.length !== BATCH_SIZE) {
    console.log("failed generating keys", body)
    return
  }
  return body.keys
}

export default {
  async fetch(request, env) {
    console.log(env.DEBUG ? "running in debug mode" : "running production mode")
    const ids = await itch(env)

    // TODO: get keys for different modules
    const keys = await foundry(env)

    for (const [id, title] of ids) {
      console.log(`==== Puppeteer for ${title} ====`)
      const browser = await puppeteer.launch(env.MYBROWSER)
      const page = await browser.newPage()
      await page.goto(`https://itch.io/game/external-keys/${id}`)

      if (env.DEBUG) {
        const currentURL = page.url()
        console.log('Current URL:', currentURL)
      }

      // login
      await page.type('input[name="username"]', 'codabool')
      await page.type('input[name="password"]', env.ITCH_PASSWORD)
      const buttons = await page.$$('button')
      await buttons[1].click()
      await page.waitForNavigation({ waitUntil: 'networkidle0' })

      // keys
      await page.goto(`https://itch.io/game/external-keys/${id}`)


      // find current remaining keys
      const tbody = await page.$('tbody')
      const secondTd = await tbody.$$('td').then(tds => tds[1])
      const text = await page.evaluate(el => el.textContent, secondTd);
      if (Number(text) < MINIMUM) {
        console.log(`DANGER! ${title} has ${text} keys remaining`)
      } else {
        console.log(`${title} has ${text} keys remaining`)
      }

      const postLogin = page.url()
      if (env.DEBUG) {
        console.log('postLogin URL:', postLogin)
      }
    
      await page.select('select[name="keys[type]"]', 'other')
    
      const textarea = await page.$('textarea')
      let keyText = ""
      keys.forEach(key => {
        keyText += key + "\n"
      })
      await textarea.type(keyText)
    
      const btns = await page.$$('button')
      await btns[btns.length -1].click()
      await page.waitForNavigation({ waitUntil: 'networkidle0' })
    
      // Close the browser
      await browser.close()
    
      return new Response(`added ${keys.length} keys, total is now ${Number(text) + keys.length} verify at https://itch.io/game/external-keys/${id}/other for ${title}`)

      //console.log(`added ${keys.length} keys, verify at https://itch.io/game/external-keys/${id}/other for ${title}`)
    }
  }
}