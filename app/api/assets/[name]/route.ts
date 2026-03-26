import { NextRequest, NextResponse } from 'next/server'
import { readFile, access } from 'fs/promises'
import { join } from 'path'

const ALLOWED: Record<string, string> = {
  'logo.png': 'image/png',
  'login-bg.jpg': 'image/jpeg',
  'login-bg.png': 'image/png',
  'login-bg-portal.jpg': 'image/jpeg',
  'login-bg-portal.png': 'image/png',
  'cadastro-bg.jpg': 'image/jpeg',
  'cadastro-bg.png': 'image/png',
  'publiclogin-bg-portal.jpg': 'image/jpeg',
  'publiclogin-bg-portal.png': 'image/png',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params

  const contentType = ALLOWED[name]
  if (!contentType) {
    return new NextResponse('Not found', { status: 404 })
  }

  const filePath = join(process.cwd(), 'public', name)

  try {
    await access(filePath)
    const file = await readFile(filePath)
    console.log(`[assets] Servindo ${name} (${file.length} bytes) de ${filePath}`)
    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    console.error(`[assets] Erro ao servir ${name} de ${filePath}:`, err)
    return new NextResponse('Not found', { status: 404 })
  }
}
