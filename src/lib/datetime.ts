export function formatDateWithTimezone(
	date: Date,
	options?: {
		locales?: Parameters<Date['toLocaleString']>[0];
		options?: Parameters<Date['toLocaleString']>[1];
	}
) {
	const localeString = date.toLocaleString(options?.locales, options?.options);
	const offset = -date.getTimezoneOffset(); // Negative because getTimezoneOffset returns opposite sign
	const hours = Math.floor(Math.abs(offset) / 60);
	const minutes = Math.abs(offset) % 60;
	const sign = offset >= 0 ? '+' : '-';
	const utcOffset = `(UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')})`;

	return `${localeString} ${utcOffset}`;
}

export function timeAgo(date: Date, now = new Date(), options?: { justNow: boolean }) {
	const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

	if ((options?.justNow ?? true) && secondsAgo < 10) {
		return 'Just now';
	}

	// Less than a minute
	if (secondsAgo < 60) {
		return secondsAgo === 1 ? '1 second ago' : `${secondsAgo} seconds ago`;
	}

	// Less than an hour
	const minutesAgo = Math.floor(secondsAgo / 60);
	if (minutesAgo < 60) {
		return minutesAgo === 1 ? '1 minute ago' : `${minutesAgo} minutes ago`;
	}

	// Less than a day
	const hoursAgo = Math.floor(minutesAgo / 60);
	if (hoursAgo < 24) {
		return hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
	}

	// Less than a month (30 days)
	const daysAgo = Math.floor(hoursAgo / 24);
	if (daysAgo < 30) {
		return daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
	}

	// Less than a year (365 days)
	const monthsAgo = Math.floor(daysAgo / 30);
	if (monthsAgo < 12) {
		return monthsAgo === 1 ? '1 month ago' : `${monthsAgo} months ago`;
	}

	// Years
	const yearsAgo = Math.floor(daysAgo / 365);
	return yearsAgo === 1 ? '1 year ago' : `${yearsAgo} years ago`;
}
