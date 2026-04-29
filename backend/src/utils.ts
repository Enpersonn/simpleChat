function repairJsonBrackets(text: string): string {
  const stack: Array<'{' | '['> = []
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (inString) {
      if (ch === '\\') {
        result += ch
        escaped = true
      } else if (ch === '"') {
        result += ch
        inString = false
      } else {
        result += ch
      }
      continue
    }

    if (ch === '"') {
      inString = true
      result += ch
    } else if (ch === '{' || ch === '[') {
      stack.push(ch)
      result += ch
    } else if (ch === '}' || ch === ']') {
      if (stack.length > 0) {
        const expected = stack[stack.length - 1] === '{' ? '}' : ']'
        result += expected
        stack.pop()
      } else {
        result += ch
      }
    } else {
      result += ch
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!
    result += top === '{' ? '}' : ']'
  }

  return result
}

function stripLineComments(text: string): string {
  let result = ""
  let inString = false
  let escaped = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (escaped) {
      result += ch
      escaped = false
      i++
      continue
    }
    if (inString) {
      if (ch === "\\") {
        result += ch
        escaped = true
      } else if (ch === '"') {
        result += ch
        inString = false
      } else {
        result += ch
      }
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    } else {
      result += ch
    }
    i++
  }
  return result
}

export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = stripLineComments((fenced ? fenced[1] : raw).trim())
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(repairJsonBrackets(text))
  }
}
