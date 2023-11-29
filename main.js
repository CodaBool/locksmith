import puppeteer from "puppeteer"

const BATCH_SIZE = 100 // max is 100
const MINIMUM = 500

// map itch ID to Foundry package name
const MODULES = {
  2331647: "terminal",
}

main()

async function itch() {
  const res = await fetch("https://itch.io/api/1/key/my-games", {
    headers: {'Authorization': `Bearer ${process.env.ITCH_TOKEN}`}
  })
  const data = await res.json()
  const ids = new Map()
  data.games.forEach(game => {
    console.log(`${game.title}: purchased ${game.purchases_count} with ${game.views_count} views`)
    ids.set(game.id, game)
  })
  return ids
}

async function foundry(package_name) {
  const data = {
    package_name,
    quantity: BATCH_SIZE, // 100 max
    dry_run: process.env.DEBUG === true ? true : false,
  }
  const res = await fetch("https://api.foundryvtt.com/_api/packages/issue-key", {
    headers: {
      'Authorization': `APIKey:codabool_${process.env.FOUNDRY_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    method: "POST",
  })
  const body = await res.json()
  if (body.status !== "success" || body.keys.length !== BATCH_SIZE) {
    console.error("failed generating keys", body)
    return
  }
  return body.keys
}

async function main() {
  console.log(process.env.DEBUG === true ? "running in debug mode" : "running production mode")
  const ids = await itch()

  for (const [id, game] of ids) {
    console.log(`==== Puppeteer for ${game.title} ====`)
    const browser = await puppeteer.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(`https://itch.io/game/external-keys/${id}`)

    // login
    await page.type('input[name="username"]', 'codabool')
    await page.type('input[name="password"]', process.env.ITCH_PASSWORD)
    const buttons = await page.$$('button')
    await buttons[1].click()
    await page.waitForNavigation({ waitUntil: 'networkidle0' })

    // keys
    await page.goto(`https://itch.io/game/external-keys/${id}`)

    // find current remaining keys
    const tbody = await page.$('tbody')
    const secondTd = await tbody.$$('td').then(tds => tds[1])
    let keys = await page.evaluate(el => el.textContent, secondTd)
    keys = Number(keys)

    if (keys < MINIMUM) {
      console.log(`DANGER! ${game.title} has ${keys} keys remaining`)

      // fetch keys
      const generated = await foundry(MODULES[id])
      if (!generated) {
        console.error("failed to generate foundry keys for", game.title)
        return
      }
      
      // insert keys
      await page.select('select[name="keys[type]"]', 'other')
  
      const textarea = await page.$('textarea')
      let keyText = ""
      generated.forEach(text => {
        keyText += text + "\n"
      })
      await textarea.type(keyText)
    
      const btns = await page.$$('button')
      await btns[btns.length -1].click()
      await page.waitForNavigation({ waitUntil: 'networkidle0' })

      keys += BATCH_SIZE

    } else {
      console.log(`${game.title} has ${keys} keys remaining`)
    }

    // Close the browser
    await browser.close()

    // update DB
    const raw = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/d1/database/${process.env.D1_ID}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CF_TOKEN}`},
      body: `{"params":[${game.purchases_count},${keys},${game.views_count},"${MODULES[id]}"],"sql":"UPDATE itch SET purchases = ?, keys = ?, views = ? WHERE module = ?;"}`
    })
    // console.log("statment", `{"params":[${game.purchases_count},${keys},${game.views_count},"${MODULES[id]}"],"sql":"UPDATE itch SET purchases = ?, keys = ?, views = ? WHERE module = ?;"}`)
    const res = await raw.json()
    if (res.errors.length) {
      console.error(res.errors[0])
    }
    console.log("wrote to", res?.result[0]?.meta?.rows_written, "row")
  
    console.log(`${keys} keys available, verify at https://itch.io/game/external-keys/${id}/other for ${game.title}`)
  }
}
