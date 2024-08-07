set -e
cd ..
cd lambda
bun run build
cd ..
cd example
bunx remotion lambda functions rmall -f
bunx remotion lambda functions deploy --memory=3000 --disk=10000
bunx remotion lambda sites create --site-name=testbed-v6 --log=verbose --enable-folder-expiry
bunx remotion lambda render testbed-v6 react-svg --log=verbose --delete-after="1-day"
