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

export function parsePhivolcsDate(dateString: string): Date {
	const parts = dateString.split(' - ');
	const datePart = parts[0];
	const timePart = parts[1];

	const dateParts = datePart.split(' ');
	const day = parseInt(dateParts[0], 10);
	const monthName = dateParts[1];
	const year = parseInt(dateParts[2], 10);

	const timeParts = timePart.split(' ');
	const time = timeParts[0];
	const amPM = timeParts[1];

	const timeHourMinute = time.split(':');
	let hours = parseInt(timeHourMinute[0], 10);
	const minutes = parseInt(timeHourMinute[1], 10);

	if (amPM === 'PM' && hours < 12) {
		hours += 12;
	}
	if (amPM === 'AM' && hours === 12) {
		hours = 0;
	}

	const monthMap: { [key: string]: number } = {
		January: 0,
		February: 1,
		March: 2,
		April: 3,
		May: 4,
		June: 5,
		July: 6,
		August: 7,
		September: 8,
		October: 9,
		November: 10,
		December: 11
	};

	const month = monthMap[monthName];

	const pad2Digits = (value: number) => value.toString().padStart(2, '0');
	const localDateString = `${year}-${pad2Digits(month + 1)}-${pad2Digits(day)}T${pad2Digits(hours)}:${pad2Digits(minutes)}:00.000+08:00`;
	const localDate = new Date(localDateString);
	return localDate;
}
