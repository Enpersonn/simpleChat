import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), preact()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('.', import.meta.url)),
			react: 'preact/compat',
			'react-dom': 'preact/compat',
			'react/jsx-runtime': 'preact/jsx-runtime',
		},
	},
	server: {
		port: 5173,
		proxy: {
			'/ai': 'http://127.0.0.1:3001',
			'/health': 'http://127.0.0.1:3001',
			'/ollama': 'http://127.0.0.1:3001',
			'/settings': 'http://127.0.0.1:3001',
			'/stories': 'http://127.0.0.1:3001',
		},
	},
});
