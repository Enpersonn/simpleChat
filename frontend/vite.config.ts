import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import preact from '@preact/preset-vite';

export default defineConfig({
	plugins: [tailwindcss(), preact()],
	resolve: {
		alias: {
			react: 'preact/compat',
			'react-dom': 'preact/compat',
			'react/jsx-runtime': 'preact/jsx-runtime',
		},
	},
	server: {
		port: 5173,
		proxy: {
			'/stories': 'http://127.0.0.1:3001',
			'/ollama': 'http://127.0.0.1:3001',
			'/settings': 'http://127.0.0.1:3001',
			'/health': 'http://127.0.0.1:3001',
			'/ai': 'http://127.0.0.1:3001',
		},
	},
});
