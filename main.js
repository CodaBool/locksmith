import puppeteer from "puppeteer"

const BATCH_SIZE = 100 // max is 100
const MINIMUM = 500

main()

async function itch() {
  const res = await fetch("https://itch.io/api/1/key/my-games", {
    headers: {'Authorization': `Bearer ${process.env.ITCH_TOKEN}`}
  })
  const data = await res.json()
  const ids = new Map()
  data.games.forEach(game => {
    console.log(`${game.title}: purchased ${game.purchases_count} with ${game.views_count} views`)
    ids.set(game.id, game.title)
  })
  return ids
}

async function foundry() {
  const data = {
    package_name: 'terminal',
    quantity: BATCH_SIZE,
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
    console.log("failed generating keys", body)
    return
  }
  return body.keys
}

async function main() {
  console.log(process.env.DEBUG === true ? "running in debug mode" : "running production mode")
  const ids = await itch()

  // TODO: get keys for different modules
  const keys = await foundry()

  for (const [id, title] of ids) {
    console.log(`==== Puppeteer for ${title} ====`)
    const browser = await puppeteer.launch({headless: false})
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
    const text = await page.evaluate(el => el.textContent, secondTd);
    if (Number(text) < MINIMUM) {
      console.log(`DANGER! ${title} has ${text} keys remaining`)
    } else {
      console.log(`${title} had ${text} keys remaining`)
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
  
    // return new Response(`added ${keys.length} keys for ${title}, verify at https://itch.io/game/external-keys/${id}/other`)

    console.log(`added ${keys.length} keys, total is now ${Number(text) + keys.length} verify at https://itch.io/game/external-keys/${id}/other for ${title}`)
  }
}
